module forwarding::forwarding {
    use std::object;
    use std::address;
    use std::fungible_asset::FungibleAsset;
    use std::option::{Self, Option};
    use std::cosmos;
    use std::bcs;
    use std::string::utf8;
    use std::json::{Self, JSONObject};
    use std::primary_fungible_store;
    use std::error;
    use std::string::{Self, String};
    use std::vector;
    use std::table;

    use endpoint_v2_common::bytes32::{Bytes32, to_bytes32};
    use endpoint_v2_common::contract_identity::{
        Self,
        CallRef,
        ContractSigner,
        create_contract_signer,
        DynamicCallRef
    };
    use endpoint_v2::endpoint::{
        Self,
        WrappedGuidAndIndex,
        wrap_guid_and_index,
        get_guid_and_index_from_wrapped
    };

    use oft::oapp_core::get_admin;
    use oft_common::oft_compose_msg_codec;
    use oft::oft::metadata;

    use deployer::deployer as deployer;

    struct ForwardingStore has key {
        nonce: u64,
        callback_info: table::Table<u64, ForwardingCallbackInfo>,
        contract_signer: ContractSigner,
        extend_ref: object::ExtendRef
    }

    struct ForwardingCallbackInfo has store, drop {
        from: address,
        amount: u64
    }

    struct ForwardingIntermediateStore has key {
        extend_ref: object::ExtendRef
    }

    fun init_module(account: &signer) {
        move_to(
            account,
            ForwardingStore {
                nonce: 0,
                callback_info: table::new(),
                contract_signer: create_contract_signer(account),
                extend_ref: deployer::claim_extend_ref(account) // to create signer of self
            }
        );

        // register composer
        endpoint::register_composer(account, utf8(b"forwarding"));
    }

    public entry fun lz_compose(
        from: address,
        guid: vector<u8>,
        index: u16,
        message: vector<u8>,
        extra_data: vector<u8>
    ) acquires ForwardingStore, ForwardingIntermediateStore {
        let guid = to_bytes32(guid);
        endpoint::clear_compose(
            &call_ref(),
            from,
            wrap_guid_and_index(guid, index),
            message
        );

        lz_compose_impl(
            from,
            guid,
            index,
            message,
            extra_data,
            option::none()
        )
    }

    public fun lz_compose_with_value(
        from: address,
        guid_and_index: WrappedGuidAndIndex,
        message: vector<u8>,
        extra_data: vector<u8>,
        value: Option<FungibleAsset>
    ) acquires ForwardingStore, ForwardingIntermediateStore {
        assert!(option::is_none(&value), error::invalid_argument(EINVALID_TOKEN));
        let (guid, index) = get_guid_and_index_from_wrapped(&guid_and_index);

        endpoint::clear_compose(&call_ref(), from, guid_and_index, message);

        lz_compose_impl(from, guid, index, message, extra_data, value);
    }

    /// a user have to send oft to intermediate_addr(from) to use compose feature
    public fun lz_compose_impl(
        _oapp: address,
        _guid: Bytes32,
        _index: u16,
        message: vector<u8>,
        _extra_data: vector<u8>,
        value: Option<FungibleAsset>
    ) acquires ForwardingStore, ForwardingIntermediateStore {
        option::destroy(
            value,
            |value| {
                primary_fungible_store::deposit(get_admin(), value)
            }
        );

        let forwarding_store = borrow_global_mut<ForwardingStore>(@forwarding);
        let forwarding_signer =
            object::generate_signer_for_extending(&forwarding_store.extend_ref);

        let payload = oft_compose_msg_codec::compose_payload_message(&message);
        let json_object = json::unmarshal<JSONObject>(payload);
        let msg_type =
            *string::bytes(
                &option::destroy_some(
                    json::get_elem<String>(&json_object, string::utf8(b"@type"))
                )
            );
        if (msg_type != b"/ibc.applications.transfer.v1.MsgTransfer"
            && msg_type != b"/opinit.ophost.v1.MsgInitiateTokenDeposit"
            && msg_type != b"/initia.move.v1.MsgExecute"
            && msg_type != b"/initia.move.v1.MsgExecuteJSON"
            && msg_type != b"/initia.move.v1.MsgScript"
            && msg_type != b"/initia.move.v1.MsgScriptJSON") {
            abort(error::invalid_argument(EINVALID_COMPOSE_MESSAGE))
        };

        let from =
            address::from_sdk(
                option::destroy_some(
                    json::get_elem<String>(&json_object, string::utf8(b"sender"))
                )
            );
        let intermediate_addr = intermediate_addr(from);
        if (!exists<ForwardingIntermediateStore>(intermediate_addr)) {
            let constructor_ref =
                object::create_named_object(&forwarding_signer, intermediate_seed(from));
            let extend_ref = object::generate_extend_ref(&constructor_ref);
            let intermediate_signer = object::generate_signer_for_extending(&extend_ref);

            move_to(
                &intermediate_signer,
                ForwardingIntermediateStore { extend_ref: extend_ref }
            )
        };

        let intermediate_store =
            borrow_global<ForwardingIntermediateStore>(intermediate_addr);
        let intermediate_signer =
            object::generate_signer_for_extending(&intermediate_store.extend_ref);

        let amount_ld = oft_compose_msg_codec::amount_ld(&message);
        primary_fungible_store::transfer(
            &forwarding_signer,
            metadata(),
            intermediate_addr,
            amount_ld
        );

        json::set_elem(
            &mut json_object,
            string::utf8(b"sender"),
            &address::to_sdk(intermediate_addr)
        );

        forwarding_store.nonce = forwarding_store.nonce + 1;
        table::add(
            &mut forwarding_store.callback_info,
            forwarding_store.nonce,
            ForwardingCallbackInfo { from: from, amount: amount_ld }
        );

        let fid = *string::bytes(&address::to_string(@forwarding));
        vector::append(&mut fid, b"::forwarding::forward_callback");
        cosmos::stargate_with_options(
            &intermediate_signer,
            json::marshal(&json_object),
            cosmos::allow_failure_with_callback(
                forwarding_store.nonce, string::utf8(fid)
            )
        );
    }

    public fun forward_callback(
        id: u64, success: bool
    ) acquires ForwardingStore, ForwardingIntermediateStore {
        let forwarding_store = borrow_global_mut<ForwardingStore>(@forwarding);
        if (!success) {
            let info = table::borrow(&forwarding_store.callback_info, id);
            let intermediate_addr = intermediate_addr(info.from);
            let intermediate_store =
                borrow_global<ForwardingIntermediateStore>(intermediate_addr);
            let intermediate_signer =
                object::generate_signer_for_extending(&intermediate_store.extend_ref);

            primary_fungible_store::transfer(
                &intermediate_signer,
                metadata(),
                info.from,
                info.amount
            );
        };
        table::remove(&mut forwarding_store.callback_info, id);
    }

    // ===================================================== View= ====================================================

    #[view]
    /// named object of forwarding_addr() with bytes(address) as seed
    public fun intermediate_addr(from: address): address {
        let intermediate_addr =
            object::create_object_address(&@forwarding, intermediate_seed(from));

        intermediate_addr
    }

    // ==================================================== Helper ====================================================

    inline fun store(): &ForwardingStore {
        borrow_global(@forwarding)
    }

    inline fun forwarding_seed(): vector<u8> {
        b"forwarding"
    }

    inline fun intermediate_seed(from: address): vector<u8> {
        bcs::to_bytes(&from)
    }

    fun call_ref<Target>(): CallRef<Target> acquires ForwardingStore {
        contract_identity::make_call_ref<Target>(&store().contract_signer)
    }

    fun dynamic_call_ref(target: address, auth: vector<u8>): DynamicCallRef acquires ForwardingStore {
        contract_identity::make_dynamic_call_ref(&store().contract_signer, target, auth)
    }

    // ================================================== Error Codes =================================================

    const EINVALID_TOKEN: u64 = 1;

    const EINVALID_COMPOSE_MESSAGE: u64 = 2;
}
