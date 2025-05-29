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
    use std::signer;

    use endpoint_v2_common::bytes32::{Bytes32, to_bytes32, to_address};
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

    use oft_common::oft_compose_msg_codec;

    use deployer::deployer as deployer;

    struct ForwardingStore has key {
        admin: address,
        nonce: u64,
        callback_info: table::Table<u64, ForwardingCallbackInfo>,
        oft_metadata: table::Table<address, address>,
        contract_signer: ContractSigner,
        extend_ref: object::ExtendRef
    }

    struct ForwardingCallbackInfo has store, drop {
        from_address: address,
        recovery_address: address,
        metadata: address,
        amount_ld: u64
    }

    struct ForwardingIntermediateStore has key {
        extend_ref: object::ExtendRef
    }

    fun init_module(account: &signer) {
        let (admin, extend_ref) = deployer::claim_temp_store(account);
        move_to(
            account,
            ForwardingStore {
                admin: admin,
                nonce: 0,
                callback_info: table::new(),
                oft_metadata: table::new(),
                contract_signer: create_contract_signer(account),
                extend_ref: extend_ref
            }
        );

        // register composer
        endpoint::register_composer(account, utf8(b"forwarding"));
    }

    // ===================================================== OFT actions ====================================================

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

    /// send the oft to the intermediate_addr(from) to execute safe_lz_compose
    fun lz_compose_impl(
        oapp: address,
        _guid: Bytes32,
        _index: u16,
        message: vector<u8>,
        _extra_data: vector<u8>,
        value: Option<FungibleAsset>
    ) acquires ForwardingStore, ForwardingIntermediateStore {
        let forwarding_store = borrow_global_mut<ForwardingStore>(@forwarding);
        option::destroy(
            value,
            |value| {
                primary_fungible_store::deposit(forwarding_store.admin, value)
            }
        );

        let forwarding_signer =
            object::generate_signer_for_extending(&forwarding_store.extend_ref);

        let from_address =
            to_address(oft_compose_msg_codec::compose_payload_from(&message));
        let amount_ld = oft_compose_msg_codec::amount_ld(&message);
        let payload = oft_compose_msg_codec::compose_payload_message(&message);
        
        // send the oft to the intermediate_addr
        let metadata = oft_metadata(oapp);
        primary_fungible_store::transfer(
            &forwarding_signer,
            metadata,
            intermediate_addr(from_address),
            amount_ld
        );

        // execute safe_lz_compose
        let safe_forward_payload = SafeForwardPayload {
            _type_: utf8(b"/initia.move.v1.MsgExecuteJSON"),
            sender: to_sdk(forwarding_signer),
            module_address: @forwarding,
            module_name: utf8(b"forwarding"),
            function_name: utf8(b"safe_forward"),
            type_args: vector[],
            args: vector[
                json::marshal_to_string(&from_address),
                json::marshal_to_string(&std::hex::encode_to_string(&payload)),
                json::marshal_to_string(&metadata),
                json::marshal_to_string(&amount_ld),
            ],
        };

        // Use stargate with allow_failure option to prevent transaction reversion
        // if any errors occur during the forwarding process. This ensures the
        // overall transaction can still complete even if this specific call fails.
        cosmos::stargate_with_options(
            &forwarding_signer,
            json::marshal(&json_object),
            cosmos::allow_failure()
        );
    }

    public entry fun safe_forward(
        forwarding_signer: &signer,
        from_address: address,
        payload: vector<u8>,
        metadata: address,
        amount_ld: u64
    ) acquires ForwardingStore, ForwardingIntermediateStore {
        // check if the sender is the forwarding contract
        assert!(
            signer::address_of(forwarding_signer) == @forwarding,
            error::permission_denied(EINVALID_FORWARDING_SENDER)
        );

        let json_object = json::unmarshal<JSONObject>(payload);

        // get the recovery address from the json object
        let recovery_address =
            address::from_sdk(
                option::destroy_some(
                    json::get_elem<String>(&json_object, string::utf8(b"sender"))
                )
            );
        let intermediate_addr = intermediate_addr(from_address);
        if (!exists<ForwardingIntermediateStore>(intermediate_addr)) {
            let constructor_ref =
                object::create_named_object(
                    &forwarding_signer, intermediate_seed(from_address)
                );
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

        // replace the sender with the intermediate address
        json::set_elem(
            &mut json_object,
            string::utf8(b"sender"),
            &address::to_sdk(intermediate_addr)
        );

        // add the callback info
        forwarding_store.nonce = forwarding_store.nonce + 1;
        table::add(
            &mut forwarding_store.callback_info,
            forwarding_store.nonce,
            ForwardingCallbackInfo {
                from_address: from_address,
                recovery_address: recovery_address,
                metadata: metadata,
                amount_ld: amount_ld
            }
        );

        // send the callback to the intermediate address
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

    /// callback send the funds to the recovery address
    public entry fun forward_callback(
        sender: &signer, id: u64, success: bool
    ) acquires ForwardingStore, ForwardingIntermediateStore {
        let forwarding_store = borrow_global_mut<ForwardingStore>(@forwarding);
        let info = table::borrow(&forwarding_store.callback_info, id);
        let intermediate_addr = intermediate_addr(info.from_address);

        assert!(
            signer::address_of(sender) == intermediate_addr,
            error::permission_denied(EINVALID_CALLBACK_SENDER)
        );
        if (!success) {
            let intermediate_store =
                borrow_global<ForwardingIntermediateStore>(intermediate_addr);
            let intermediate_signer =
                object::generate_signer_for_extending(&intermediate_store.extend_ref);

            primary_fungible_store::transfer(
                &intermediate_signer,
                info.metadata,
                info.recovery_address,
                info.amount_ld
            );
        };
        table::remove(&mut forwarding_store.callback_info, id);
    }

    // ===================================================== Admin actions ====================================================

    public entry fun set_oft_metadata(
        account: &signer,
        oapp_addr: address,
        metadata_addr: address
    ) acquires ForwardingStore {
        assert!(
            signer::address_of(account) == store().admin,
            error::permission_denied(EINVALID_ADMIN)
        );

        table::upsert(&mut store_mut().oft_metadata, oapp_addr, metadata_addr);
    }

    public entry fun transfer_admin(
        account: &signer,
        new_admin: address
    ) acquires ForwardingStore {
        assert!(
            signer::address_of(account) == store().admin,
            error::permission_denied(EINVALID_ADMIN)
        );
        store_mut().admin = new_admin;
    }

    public entry fun upgrade(
        account: &signer,
        module_ids: vector<String>,
        code: vector<vector<u8>>,
    ) acquires ForwardingStore, ForwardingIntermediateStore {
        assert!(
            signer::address_of(account) == store().admin,
            error::permission_denied(EINVALID_ADMIN)
        );

        let forwarding_signer = object::generate_signer_for_extending(&store().extend_ref);
        code::publish_v2(&forwarding_signer, code, 1);
    }

    public entry fun emergency_withdraw(
        account: &signer,
        recipient: address,
        metadata: address,
        amount: u64
    ) acquires ForwardingStore {
        assert!(
            signer::address_of(account) == store().admin,
            error::permission_denied(EINVALID_ADMIN)
        );
        let forwarding_signer = object::generate_signer_for_extending(&store().extend_ref);
        primary_fungible_store::transfer(
            &forwarding_signer,
            metadata,
            recipient,
            amount
        );
    }

    // ===================================================== View actions ====================================================

    #[view]
    /// named object of forwarding_addr() with bytes(address) as seed
    public fun intermediate_addr(from: address): address {
        let intermediate_addr =
            object::create_object_address(&@forwarding, intermediate_seed(from));

        intermediate_addr
    }

    #[view]
    public fun oft_metadata(oapp_addr: address): address acquires ForwardingStore {
        assert!(
            table::contains(&store().oft_metadata, oapp_addr),
            error::invalid_argument(ENOT_REGISTERED_OAPP)
        );

        table::borrow(&store().oft_metadata, oapp_addr)
    }

    // ==================================================== Helper ====================================================

    inline fun store(): &ForwardingStore {
        borrow_global(@forwarding)
    }

    inline fun store_mut(): &mut ForwardingStore {
        borrow_global_mut(@forwarding)
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

    const EINVALID_CALLBACK_SENDER: u64 = 3;

    const EINVALID_FORWARDING_SENDER: u64 = 4;

    const EINVALID_ADMIN: u64 = 5;

    const ENOT_REGISTERED_OAPP: u64 = 6;

    // ================================================== Encoding Structs ==================================================

    struct SafeForwardPayload has drop {
        _type_: String,
        sender: String,
        module_address: address,
        module_name: String,
        function_name: String,
        type_args: vector<String>,
        args: vector<String>,
    }
}
