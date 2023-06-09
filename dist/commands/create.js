"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const url_1 = require("url");
const core_1 = require("@oclif/core");
const gluegun_1 = require("gluegun");
const auth_1 = require("../command-helpers/auth");
const jsonrpc_1 = require("../command-helpers/jsonrpc");
const node_1 = require("../command-helpers/node");
class CreateCommand extends core_1.Command {
    async run() {
        const { args: { 'subgraph-name': subgraphName }, flags: { 'access-token': accessTokenFlag, node }, } = await this.parse(CreateCommand);
        try {
            (0, node_1.validateNodeUrl)(node);
        }
        catch (e) {
            this.error(`Graph node "${node}" is invalid: ${e.message}`, { exit: 1 });
        }
        const requestUrl = new url_1.URL(node);
        const client = (0, jsonrpc_1.createJsonRpcClient)(requestUrl);
        // Exit with an error code if the client couldn't be created
        if (!client) {
            this.exit(1);
            return;
        }
        // Use the access token, if one is set
        const accessToken = await (0, auth_1.identifyDeployKey)(node, accessTokenFlag);
        if (accessToken !== undefined && accessToken !== null) {
            // @ts-expect-error options property seems to exist
            client.options.headers = { Authorization: `Bearer ${accessToken}` };
        }
        const spinner = gluegun_1.print.spin(`Creating subgraph in Graph node: ${requestUrl}`);
        client.request('subgraph_create', { name: subgraphName }, (
        // @ts-expect-error TODO: why are the arguments not typed?
        requestError, 
        // @ts-expect-error TODO: why are the arguments not typed?
        jsonRpcError, 
        // TODO: this argument is unused, but removing it fails the basic-event-handlers tests
        // @ts-expect-error TODO: why are the arguments not typed?
        _res) => {
            if (jsonRpcError) {
                spinner.fail(`Error creating the subgraph: ${jsonRpcError.message}`);
                this.exit(1);
            }
            else if (requestError) {
                spinner.fail(`HTTP error creating the subgraph: ${requestError.code}`);
                this.exit(1);
            }
            else {
                spinner.stop();
                gluegun_1.print.success(`Created subgraph: ${subgraphName}`);
            }
        });
    }
}
CreateCommand.description = 'Registers a subgraph name';
CreateCommand.args = {
    'subgraph-name': core_1.Args.string({
        required: true,
    }),
};
CreateCommand.flags = {
    help: core_1.Flags.help({
        char: 'h',
    }),
    node: core_1.Flags.string({
        summary: 'Graph node to create the subgraph in.',
        char: 'g',
        required: true,
    }),
    'access-token': core_1.Flags.string({
        summary: 'Graph access token.',
    }),
};
exports.default = CreateCommand;
