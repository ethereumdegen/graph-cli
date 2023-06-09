"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const gluegun_1 = require("gluegun");
const prettier_1 = __importDefault(require("prettier"));
const subgraph_1 = require("../command-helpers/subgraph");
const version_1 = require("../version");
const mapping_1 = require("./mapping");
const schema_1 = require("./schema");
const tests_1 = require("./tests");
const GRAPH_CLI_VERSION = process.env.GRAPH_CLI_TESTS
    ? // JSON.stringify should remove this key, we will install the local
        // graph-cli for the tests using `npm link` instead of fetching from npm.
        undefined
    : // For scaffolding real subgraphs
        version_1.version;
class Scaffold {
    constructor(options) {
        this.protocol = options.protocol;
        this.abi = options.abi;
        this.indexEvents = options.indexEvents;
        this.contract = options.contract;
        this.network = options.network;
        this.contractName = options.contractName;
        this.subgraphName = options.subgraphName;
        this.startBlock = options.startBlock;
        this.node = options.node;
    }
    generatePackageJson() {
        return prettier_1.default.format(JSON.stringify({
            name: (0, subgraph_1.getSubgraphBasename)(String(this.subgraphName)),
            license: 'UNLICENSED',
            scripts: {
                codegen: 'graph codegen',
                build: 'graph build',
                deploy: `graph deploy ` + `--node ${this.node} ` + this.subgraphName,
                'create-local': `graph create --node http://localhost:8020/ ${this.subgraphName}`,
                'remove-local': `graph remove --node http://localhost:8020/ ${this.subgraphName}`,
                'deploy-local': `graph deploy ` +
                    `--node http://localhost:8020/ ` +
                    `--ipfs http://localhost:5001 ` +
                    this.subgraphName,
                test: 'graph test',
            },
            dependencies: {
                '@graphprotocol/graph-cli': GRAPH_CLI_VERSION,
                '@graphprotocol/graph-ts': `0.29.1`,
            },
            devDependencies: this.protocol.hasEvents() ? { 'matchstick-as': `0.5.0` } : undefined,
        }), { parser: 'json' });
    }
    generateManifest() {
        const protocolManifest = this.protocol.getManifestScaffold();
        return prettier_1.default.format(`
specVersion: 0.0.5
schema:
  file: ./schema.graphql
dataSources:
  - kind: ${this.protocol.name}
    name: ${this.contractName}
    network: ${this.network}
    source: ${protocolManifest.source(this)}
    mapping: ${protocolManifest.mapping(this)}
`, { parser: 'yaml' });
    }
    generateSchema() {
        const hasEvents = this.protocol.hasEvents();
        const events = hasEvents ? (0, schema_1.abiEvents)(this.abi).toJS() : [];
        return prettier_1.default.format(hasEvents && this.indexEvents
            ? events
                .map((event) => (0, schema_1.generateEventType)(event, this.protocol.name, this.contractName))
                .join('\n\n')
            : (0, schema_1.generateExampleEntityType)(this.protocol, events), {
            parser: 'graphql',
        });
    }
    generateTsConfig() {
        return prettier_1.default.format(JSON.stringify({
            extends: '@graphprotocol/graph-ts/types/tsconfig.base.json',
            include: ['src', 'tests'],
        }), { parser: 'json' });
    }
    generateMappings() {
        return this.protocol.getMappingScaffold()
            ? { [`${gluegun_1.strings.kebabCase(this.contractName)}.ts`]: this.generateMapping() }
            : undefined;
    }
    generateMapping() {
        const hasEvents = this.protocol.hasEvents();
        const events = hasEvents ? (0, schema_1.abiEvents)(this.abi).toJS() : [];
        const protocolMapping = this.protocol.getMappingScaffold();
        return prettier_1.default.format(hasEvents && this.indexEvents
            ? (0, mapping_1.generateEventIndexingHandlers)(events, this.contractName)
            : protocolMapping.generatePlaceholderHandlers({
                ...this,
                events,
            }), { parser: 'typescript', semi: false });
    }
    generateABIs() {
        return this.protocol.hasABIs()
            ? {
                [`${this.contractName}.json`]: prettier_1.default.format(JSON.stringify(this.abi?.data), {
                    parser: 'json',
                }),
            }
            : undefined;
    }
    generateTests() {
        const hasEvents = this.protocol.hasEvents();
        const events = hasEvents ? (0, schema_1.abiEvents)(this.abi).toJS() : [];
        return events.length > 0
            ? (0, tests_1.generateTestsFiles)(this.contractName, events, this.indexEvents)
            : undefined;
    }
    generate() {
        return {
            'package.json': this.generatePackageJson(),
            'subgraph.yaml': this.generateManifest(),
            'schema.graphql': this.generateSchema(),
            'tsconfig.json': this.generateTsConfig(),
            src: this.generateMappings(),
            abis: this.generateABIs(),
            tests: this.generateTests(),
        };
    }
}
exports.default = Scaffold;
