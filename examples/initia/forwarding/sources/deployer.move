module deployer::deployer {
    use std::object;
    use std::code;
    use std::signer;
    use std::error;
    use std::vector;
    use std::bcs;
    use std::option;

    struct DeployerStore has key, drop {
        extend_ref: option::Option<object::ExtendRef>,
        nonce: u64,
    }

    fun init_module(account: &signer) {
        move_to(account, DeployerStore {
            extend_ref: option::none(),
            nonce: 0,
        });
    }

    public entry fun deploy_forwarding(
        account: &signer,
        code: vector<vector<u8>>,
    ) acquires DeployerStore {
        assert!(signer::address_of(account) == @deployer, error::permission_denied(EINVALID_DEPLOYER_ACCOUNT));

        let deployer_store = deployer_store_mut();

        let constructor_ref = object::create_named_object(account, forwarding_seed(deployer_store.nonce));
        let extend_ref = option::some(object::generate_extend_ref(&constructor_ref));

        deployer_store.extend_ref = extend_ref;
        deployer_store.nonce = deployer_store.nonce + 1;

        let forwarding_signer = object::generate_signer_for_extending(option::borrow(&deployer_store.extend_ref));
        code::publish_v2(&forwarding_signer, code, 1);
    }

    public fun claim_extend_ref(account: &signer): object::ExtendRef acquires DeployerStore {
        assert!(signer::address_of(account) == forwarding_addr(deployer_store().nonce-1), error::permission_denied(EINVALID_FORWARDING_ACCOUNT));
        let deployer_store = deployer_store_mut();
        option::extract(&mut deployer_store.extend_ref)
    }

    // ==================================================== Helper ====================================================

    inline fun deployer_store(): &DeployerStore { borrow_global(@deployer) }
    inline fun deployer_store_mut(): &mut DeployerStore { borrow_global_mut(@deployer) }

    inline fun forwarding_seed(nonce: u64): vector<u8> {
        let seed = b"forwarding";
        vector::append(&mut seed, bcs::to_bytes(&nonce));
        seed
    }

    /// named object of @oft with b"oft_compose" as seed
    inline fun forwarding_addr(nonce: u64): address {
        object::create_object_address(&@deployer, forwarding_seed(nonce))
    }

    #[view]
    public fun nonce(): u64 acquires DeployerStore {
        deployer_store().nonce
    }

    // ================================================== Error Codes =================================================

    const EINVALID_FORWARDING_ACCOUNT: u64 = 1;
    const EINVALID_DEPLOYER_ACCOUNT: u64 = 2;

    #[test]
    public fun test_deployer_forwarding_addr() {
        let addr = forwarding_addr(0);
        std::debug::print(&addr);
        assert!(addr == @forwarding, 0);
    }
}