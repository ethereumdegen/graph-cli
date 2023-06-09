"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const immutable_1 = __importDefault(require("immutable"));
const debug_1 = __importDefault(require("../debug"));
const ArweaveManifestScaffold = __importStar(require("./arweave/scaffold/manifest"));
const ArweaveMappingScaffold = __importStar(require("./arweave/scaffold/mapping"));
const subgraph_1 = __importDefault(require("./arweave/subgraph"));
const CosmosManifestScaffold = __importStar(require("./cosmos/scaffold/manifest"));
const CosmosMappingScaffold = __importStar(require("./cosmos/scaffold/mapping"));
const subgraph_2 = __importDefault(require("./cosmos/subgraph"));
const abi_1 = __importDefault(require("./ethereum/abi"));
const template_1 = __importDefault(require("./ethereum/codegen/template"));
const contract_1 = __importDefault(require("./ethereum/contract"));
const EthereumManifestScaffold = __importStar(require("./ethereum/scaffold/manifest"));
const EthereumMappingScaffold = __importStar(require("./ethereum/scaffold/mapping"));
const subgraph_3 = __importDefault(require("./ethereum/subgraph"));
const type_generator_1 = __importDefault(require("./ethereum/type-generator"));
const contract_2 = __importDefault(require("./near/contract"));
const NearManifestScaffold = __importStar(require("./near/scaffold/manifest"));
const NearMappingScaffold = __importStar(require("./near/scaffold/mapping"));
const subgraph_4 = __importDefault(require("./near/subgraph"));
const SubstreamsManifestScaffold = __importStar(require("./substreams/scaffold/manifest"));
const subgraph_5 = __importDefault(require("./substreams/subgraph"));
const protocolDebug = (0, debug_1.default)('graph-cli:protocol');
class Protocol {
    static fromDataSources(dataSourcesAndTemplates) {
        const firstDataSourceKind = dataSourcesAndTemplates[0].kind;
        return new Protocol(firstDataSourceKind);
    }
    constructor(name) {
        this.name = Protocol.normalizeName(name);
        switch (this.name) {
            case 'arweave':
                this.config = arweaveProtocol;
                break;
            case 'cosmos':
                this.config = cosmosProtocol;
                break;
            case 'ethereum':
                this.config = ethereumProtocol;
                break;
            case 'near':
                this.config = nearProtocol;
                break;
            case 'substreams':
                this.config = substreamsProtocol;
                break;
            default:
            // Do not throw when undefined, a better error message is printed after the constructor
            // when validating the Subgraph itself
        }
    }
    static availableProtocols() {
        return immutable_1.default.fromJS({
            // `ethereum/contract` is kept for backwards compatibility.
            // New networks (or protocol perhaps) shouldn't have the `/contract` anymore (unless a new case makes use of it).
            arweave: ['arweave'],
            ethereum: ['ethereum', 'ethereum/contract'],
            near: ['near'],
            cosmos: ['cosmos'],
            substreams: ['substreams'],
        });
    }
    static availableNetworks() {
        let networks = immutable_1.default.fromJS({
            arweave: ['arweave-mainnet'],
            ethereum: [
                'mainnet',
                'rinkeby',
                'goerli',
                'poa-core',
                'poa-sokol',
                'gnosis',
                'matic',
                'mumbai',
                'fantom',
                'fantom-testnet',
                'bsc',
                'chapel',
                'clover',
                'avalanche',
                'fuji',
                'celo',
                'celo-alfajores',
                'fuse',
                'moonbeam',
                'moonriver',
                'mbase',
                'arbitrum-one',
                'arbitrum-goerli',
                'optimism',
                'optimism-goerli',
                'aurora',
                'aurora-testnet',
                'base-testnet',
                'zksync-era',
                'sepolia',
                'polygon-zkevm-testnet',
                'polygon-zkevm',
            ],
            near: ['near-mainnet', 'near-testnet'],
            cosmos: [
                'cosmoshub-4',
                'theta-testnet-001',
                'osmosis-1',
                'osmo-test-4',
                'juno-1',
                'uni-3', // Juno testnet
            ],
            substreams: ['mainnet'],
        });
        const allNetworks = [];
        // eslint-disable-next-line unicorn/no-array-for-each
        networks.forEach(value => {
            allNetworks.push(...value);
        });
        networks = networks.set('substreams', immutable_1.default.List(allNetworks));
        return networks;
    }
    static normalizeName(name) {
        return Protocol.availableProtocols().findKey(possibleNames => {
            return possibleNames.includes(name);
        });
    }
    displayName() {
        return this.config?.displayName;
    }
    // Receives a data source kind, and checks if it's valid
    // for the given protocol instance (this).
    isValidKindName(kind) {
        return Protocol.availableProtocols().get(this.name, immutable_1.default.List()).includes(kind);
    }
    hasABIs() {
        return this.config.abi != null;
    }
    hasContract() {
        return this.config.contract != null;
    }
    hasEvents() {
        // A problem with hasEvents usage in the codebase is that it's almost every where
        // where used, the ABI data is actually use after the conditional, so it seems
        // both concept are related. So internally, we map to this condition.
        return this.hasABIs();
    }
    hasTemplates() {
        return this.config.getTemplateCodeGen != null;
    }
    hasDataSourceMappingFile() {
        return this.getMappingScaffold() != null;
    }
    getTypeGenerator(options) {
        if (this.config == null || this.config.getTypeGenerator == null) {
            return null;
        }
        return this.config.getTypeGenerator(options);
    }
    getTemplateCodeGen(template) {
        if (!this.hasTemplates()) {
            throw new Error(`Template data sources with kind '${this.name}' are not supported yet`);
        }
        return this.config.getTemplateCodeGen?.(template);
    }
    getABI() {
        return this.config.abi;
    }
    getSubgraph(options) {
        return this.config.getSubgraph({ ...options, protocol: this });
    }
    getContract() {
        return this.config.contract;
    }
    getManifestScaffold() {
        return this.config.manifestScaffold;
    }
    getMappingScaffold() {
        return this.config.mappingScaffold;
    }
}
exports.default = Protocol;
const arweaveProtocol = {
    displayName: 'Arweave',
    abi: undefined,
    contract: undefined,
    getTemplateCodeGen: undefined,
    getTypeGenerator: undefined,
    getSubgraph(options) {
        return new subgraph_1.default(options);
    },
    manifestScaffold: ArweaveManifestScaffold,
    mappingScaffold: ArweaveMappingScaffold,
};
const cosmosProtocol = {
    displayName: 'Cosmos',
    abi: undefined,
    contract: undefined,
    getTemplateCodeGen: undefined,
    getTypeGenerator: undefined,
    getSubgraph(options) {
        return new subgraph_2.default(options);
    },
    manifestScaffold: CosmosManifestScaffold,
    mappingScaffold: CosmosMappingScaffold,
};
const ethereumProtocol = {
    displayName: 'Ethereum',
    abi: abi_1.default,
    contract: contract_1.default,
    getTemplateCodeGen(template) {
        return new template_1.default(template);
    },
    getTypeGenerator(options) {
        return new type_generator_1.default(options);
    },
    getSubgraph(options) {
        return new subgraph_3.default(options);
    },
    manifestScaffold: EthereumManifestScaffold,
    mappingScaffold: EthereumMappingScaffold,
};
const nearProtocol = {
    displayName: 'NEAR',
    abi: undefined,
    contract: contract_2.default,
    getTypeGenerator: undefined,
    getTemplateCodeGen: undefined,
    getSubgraph(options) {
        return new subgraph_4.default(options);
    },
    manifestScaffold: NearManifestScaffold,
    mappingScaffold: NearMappingScaffold,
};
const substreamsProtocol = {
    displayName: 'Substreams',
    abi: undefined,
    contract: undefined,
    getTypeGenerator: undefined,
    getTemplateCodeGen: undefined,
    getSubgraph(options) {
        return new subgraph_5.default(options);
    },
    manifestScaffold: SubstreamsManifestScaffold,
    mappingScaffold: undefined,
};
protocolDebug('Available networks %M', Protocol.availableNetworks());
