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
const path_1 = __importDefault(require("path"));
const url_1 = require("url");
const core_1 = require("@oclif/core");
const gluegun_1 = require("gluegun");
const auth_1 = require("../command-helpers/auth");
const compiler_1 = require("../command-helpers/compiler");
const DataSourcesExtractor = __importStar(require("../command-helpers/data-sources"));
const ipfs_1 = require("../command-helpers/ipfs");
const jsonrpc_1 = require("../command-helpers/jsonrpc");
const network_1 = require("../command-helpers/network");
const node_1 = require("../command-helpers/node");
const studio_1 = require("../command-helpers/studio");
const version_1 = require("../command-helpers/version");
const protocols_1 = __importDefault(require("../protocols"));
const headersFlag = core_1.Flags.custom({
    summary: 'Add custom headers that will be used by the IPFS HTTP client.',
    aliases: ['hdr'],
    parse: val => JSON.parse(val),
    default: {},
});
class DeployCommand extends core_1.Command {
    async run() {
        const { args: { 'subgraph-name': subgraphName, 'subgraph-manifest': manifest }, flags: { product: productFlag, studio, 'deploy-key': deployKeyFlag, 'access-token': accessToken, 'version-label': versionLabelFlag, ipfs, headers, node: nodeFlag, 'output-dir': outputDir, 'skip-migrations': skipMigrations, watch, 'debug-fork': debugFork, network, 'network-file': networkFile, }, } = await this.parse(DeployCommand);
        // We are given a node URL, so we prioritize that over the product flag
        const product = nodeFlag
            ? productFlag
            : studio
                ? 'subgraph-studio'
                : productFlag ||
                    (await core_1.ux.prompt('Which product to deploy for?', {
                        required: true,
                    }));
        try {
            const dataSourcesAndTemplates = await DataSourcesExtractor.fromFilePath(manifest);
            for (const { network } of dataSourcesAndTemplates) {
                (0, studio_1.validateStudioNetwork)({ studio, product, network });
            }
        }
        catch (e) {
            this.error(e, { exit: 1 });
        }
        const { node } = (0, node_1.chooseNodeUrl)({
            product,
            studio,
            node: nodeFlag,
        });
        if (!node) {
            // shouldn't happen, but we do the check to satisfy TS
            this.error('No Graph node provided');
        }
        let protocol;
        try {
            // Checks to make sure deploy doesn't run against
            // older subgraphs (both apiVersion and graph-ts version).
            //
            // We don't want the deploy to run without these conditions
            // because that would mean the CLI would try to compile code
            // using the wrong AssemblyScript compiler.
            await (0, version_1.assertManifestApiVersion)(manifest, '0.0.5');
            await (0, version_1.assertGraphTsVersion)(path_1.default.dirname(manifest), '0.25.0');
            const dataSourcesAndTemplates = await DataSourcesExtractor.fromFilePath(manifest);
            protocol = protocols_1.default.fromDataSources(dataSourcesAndTemplates);
        }
        catch (e) {
            this.error(e, { exit: 1 });
        }
        if (network) {
            const identifierName = protocol.getContract().identifierName();
            await (0, network_1.updateSubgraphNetwork)(manifest, network, networkFile, identifierName);
        }
        const isStudio = node.match(/studio/);
        const isHostedService = node.match(/thegraph.com/) && !isStudio;
        const compiler = (0, compiler_1.createCompiler)(manifest, {
            ipfs,
            headers,
            outputDir,
            outputFormat: 'wasm',
            skipMigrations,
            blockIpfsMethods: isStudio || undefined,
            protocol,
        });
        // Exit with an error code if the compiler couldn't be created
        if (!compiler) {
            this.exit(1);
            return;
        }
        // Ask for label if not on hosted service
        let versionLabel = versionLabelFlag;
        if (!versionLabel && !isHostedService) {
            versionLabel = await core_1.ux.prompt('Which version label to use? (e.g. "v0.0.1")', {
                required: true,
            });
        }
        const requestUrl = new url_1.URL(node);
        const client = (0, jsonrpc_1.createJsonRpcClient)(requestUrl);
        // Exit with an error code if the client couldn't be created
        if (!client) {
            this.exit(1);
            return;
        }
        // Use the deploy key, if one is set
        let deployKey = deployKeyFlag;
        if (!deployKey && accessToken) {
            deployKey = accessToken; // backwards compatibility
        }
        deployKey = await (0, auth_1.identifyDeployKey)(node, deployKey);
        if (deployKey !== undefined && deployKey !== null) {
            // @ts-expect-error options property seems to exist
            client.options.headers = { Authorization: 'Bearer ' + deployKey };
        }
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- request needs it
        const self = this;
        const deploySubgraph = async (ipfsHash) => {
            const spinner = gluegun_1.print.spin(`Deploying to Graph node ${requestUrl}`);
            client.request('subgraph_deploy', {
                name: subgraphName,
                ipfs_hash: ipfsHash,
                version_label: versionLabel,
                debug_fork: debugFork,
            }, async (
            // @ts-expect-error TODO: why are the arguments not typed?
            requestError, 
            // @ts-expect-error TODO: why are the arguments not typed?
            jsonRpcError, 
            // @ts-expect-error TODO: why are the arguments not typed?
            res) => {
                if (jsonRpcError) {
                    let errorMessage = `Failed to deploy to Graph node ${requestUrl}: ${jsonRpcError.message}`;
                    // Provide helpful advice when the subgraph has not been created yet
                    if (jsonRpcError.message.match(/subgraph name not found/)) {
                        if (isHostedService) {
                            errorMessage +=
                                '\nYou may need to create it at https://thegraph.com/explorer/dashboard.';
                        }
                        else {
                            errorMessage += `
Make sure to create the subgraph first by running the following command:
$ graph create --node ${node} ${subgraphName}`;
                        }
                    }
                    self.error(errorMessage, { exit: 1 });
                }
                else if (requestError) {
                    spinner.fail(`HTTP error deploying the subgraph ${requestError.code}`);
                    this.exit(1);
                }
                else {
                    spinner.stop();
                    const base = requestUrl.protocol + '//' + requestUrl.hostname;
                    let playground = res.playground;
                    let queries = res.queries;
                    // Add a base URL if graph-node did not return the full URL
                    if (playground.charAt(0) === ':') {
                        playground = base + playground;
                    }
                    if (queries.charAt(0) === ':') {
                        queries = base + queries;
                    }
                    if (isHostedService) {
                        gluegun_1.print.success(`Deployed to https://thegraph.com/explorer/subgraph/${subgraphName}`);
                    }
                    else {
                        gluegun_1.print.success(`Deployed to ${playground}`);
                    }
                    gluegun_1.print.info('\nSubgraph endpoints:');
                    gluegun_1.print.info(`Queries (HTTP):     ${queries}`);
                    gluegun_1.print.info(``);
                }
            });
        };
        if (watch) {
            await compiler.watchAndCompile(async (ipfsHash) => {
                if (ipfsHash !== undefined) {
                    await deploySubgraph(ipfsHash);
                }
            });
        }
        else {
            const result = await compiler.compile();
            if (result === undefined || result === false) {
                // Compilation failed, not deploying.
                process.exitCode = 1;
                return;
            }
            await deploySubgraph(result);
        }
    }
}
DeployCommand.description = 'Deploys a subgraph to a Graph node.';
DeployCommand.args = {
    'subgraph-name': core_1.Args.string({
        required: true,
    }),
    'subgraph-manifest': core_1.Args.string({
        default: 'subgraph.yaml',
    }),
};
DeployCommand.flags = {
    help: core_1.Flags.help({
        char: 'h',
    }),
    product: core_1.Flags.string({
        summary: 'Select a product for which to authenticate.',
        options: ['subgraph-studio', 'hosted-service'],
    }),
    studio: core_1.Flags.boolean({
        summary: 'Shortcut for "--product subgraph-studio".',
        exclusive: ['product'],
    }),
    node: core_1.Flags.string({
        summary: 'Graph node for which to initialize.',
        char: 'g',
    }),
    'deploy-key': core_1.Flags.string({
        summary: 'User deploy key.',
        exclusive: ['access-token'],
    }),
    'access-token': core_1.Flags.string({
        deprecated: true,
        summary: 'Graph access key. DEPRECATED: Use "--deploy-key" instead.',
        exclusive: ['deploy-key'],
    }),
    'version-label': core_1.Flags.string({
        summary: 'Version label used for the deployment.',
        char: 'l',
    }),
    ipfs: core_1.Flags.string({
        summary: 'Upload build results to an IPFS node.',
        char: 'i',
        default: ipfs_1.DEFAULT_IPFS_URL,
    }),
    headers: headersFlag(),
    'debug-fork': core_1.Flags.string({
        summary: 'ID of a remote subgraph whose store will be GraphQL queried.',
    }),
    'output-dir': core_1.Flags.directory({
        summary: 'Output directory for build results.',
        char: 'o',
        default: 'build/',
    }),
    'skip-migrations': core_1.Flags.boolean({
        summary: 'Skip subgraph migrations.',
    }),
    watch: core_1.Flags.boolean({
        summary: 'Regenerate types when subgraph files change.',
        char: 'w',
    }),
    network: core_1.Flags.string({
        summary: 'Network configuration to use from the networks config file.',
    }),
    // TODO: should be networksFile (with an "s"), or?
    'network-file': core_1.Flags.file({
        summary: 'Networks config file path.',
        default: 'networks.json',
    }),
};
exports.default = DeployCommand;
