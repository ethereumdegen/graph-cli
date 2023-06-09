"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const MINIMUM_ACCOUNT_ID_LENGTH = 2;
const MAXIMUM_ACCOUNT_ID_LENGTH = 64;
const RULES_URL = 'https://docs.near.org/docs/concepts/account#account-id-rules';
class NearContract {
    static identifierName() {
        return 'account';
    }
    constructor(account) {
        this.account = account;
        this.account = account;
    }
    validateLength(value) {
        return value.length >= MINIMUM_ACCOUNT_ID_LENGTH && value.length <= MAXIMUM_ACCOUNT_ID_LENGTH;
    }
    validateFormat(value) {
        const pattern = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
        return pattern.test(value);
    }
    validate() {
        if (!this.validateLength(this.account)) {
            return {
                valid: false,
                error: `Account must be between '${MINIMUM_ACCOUNT_ID_LENGTH}' and '${MAXIMUM_ACCOUNT_ID_LENGTH}' characters, see ${RULES_URL}`,
            };
        }
        if (!this.validateFormat(this.account)) {
            return {
                valid: false,
                error: `Account must conform to the rules on ${RULES_URL}`,
            };
        }
        return {
            valid: true,
            error: null,
        };
    }
}
exports.default = NearContract;
