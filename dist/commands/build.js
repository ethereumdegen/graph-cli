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
const core_1 = require("@oclif/core");
const gluegun_1 = require("gluegun");
const compiler_1 = require("../command-helpers/compiler");
const DataSourcesExtractor = __importStar(require("../command-helpers/data-sources"));
const network_1 = require("../command-helpers/network");
const debug_1 = __importDefault(require("../debug"));
const protocols_1 = __importDefault(require("../protocols"));
const buildDebug = (0, debug_1.default)('graph-cli:build');
class BuildCommand extends core_1.Command {
    async run() {
        const { args: { 'subgraph-manifest': manifest }, flags: { ipfs, 'output-dir': outputDir, 'output-format': outputFormat, 'skip-migrations': skipMigrations, watch, network, 'network-file': networkFile, }, } = await this.parse(BuildCommand);
        let protocol;
        try {
            const dataSourcesAndTemplates = await DataSourcesExtractor.fromFilePath(manifest);
            protocol = protocols_1.default.fromDataSources(dataSourcesAndTemplates);
        }
        catch (e) {
            this.error(e, { exit: 1 });
        }
        buildDebug('Detected protocol "%s" (%o)', protocol.name, protocol);
        if (network && gluegun_1.filesystem.exists(networkFile) !== 'file') {
            this.error(`Network file '${networkFile}' does not exists or is not a file!`, { exit: 1 });
        }
        if (network) {
            const identifierName = protocol.getContract().identifierName();
            await (0, network_1.updateSubgraphNetwork)(manifest, network, networkFile, identifierName);
        }
        const compiler = (0, compiler_1.createCompiler)(manifest, {
            ipfs,
            outputDir,
            outputFormat,
            skipMigrations,
            protocol,
        });
        // Exit with an error code if the compiler couldn't be created
        if (!compiler) {
            this.exit(1);
            return;
        }
        // Watch subgraph files for changes or additions, trigger
        // compile (if watch argument specified)
        if (watch) {
            await compiler.watchAndCompile();
        }
        else {
            const result = await compiler.compile();
            if (result === false) {
                this.exit(1);
            }
        }
    }
}
BuildCommand.description = 'Builds a subgraph and (optionally) uploads it to IPFS.';
BuildCommand.args = {
    'subgraph-manifest': core_1.Args.string({
        default: 'subgraph.yaml',
    }),
};
BuildCommand.flags = {
    help: core_1.Flags.help({
        char: 'h',
    }),
    ipfs: core_1.Flags.string({
        summary: 'Upload build results to an IPFS node.',
        char: 'i',
    }),
    'output-dir': core_1.Flags.directory({
        summary: 'Output directory for build results.',
        char: 'o',
        default: 'build/',
    }),
    'output-format': core_1.Flags.string({
        summary: 'Output format for mappings.',
        char: 't',
        options: ['wasm', 'wast'],
        default: 'wasm',
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
exports.default = BuildCommand;
