/*!
 * ISC License
 *
 * Copyright (c) 2018-present, Mykhailo Stadnyk <mikhus@gmail.com>
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */
import {
    ArgumentNode,
    DirectiveNode,
    SelectionNode,
    FragmentDefinitionNode,
    GraphQLResolveInfo,
    FieldNode,
} from 'graphql';

/**
 * Pre-compiled wildcard replacement regexp
 *
 * @type {RegExp}
 */
const RX_AST = /\*/g;

/**
 * Fragment item type
 *
 * @access public
 */
export interface FragmentItem {
    [name: string]: FragmentDefinitionNode;
}

/**
 * Field names transformation map interface
 *
 * @access public
 */
export interface FieldNamesMap {
    [name: string]: string;
}

/**
 * fieldsList options argument interface
 *
 * @access public
 */
export interface FieldsListOptions {
    /**
     * Path to a tree branch which should be mapped during fields extraction
     * @type {string}
     */
    path?: string;

    /**
     * Transformation rules which should be used to re-name field names
     * @type {FieldNamesMap}
     */
    transform?: FieldNamesMap;

    /**
     * Flag which turns on/off GraphQL directives checks on a fields
     * and take them into account during fields analysis
     * @type {boolean}
     */
    withDirectives?: boolean;

    /**
     * Flag which turns on/off whether to return the parent fields or not
     * @type {boolean}
     */
    keepParentField?: boolean;

    /**
     * Fields skip rule patterns. Usually used to ignore part of request field
     * subtree. For example if query looks like:
     * profiles {
     *   id
     *   users {
     *     name
     *     email
     *     password
     *   }
     * }
     * and you doo n not care about users, it can be done like:
     * fieldsList(info, { skip: ['users'] }); // or
     * fieldsProjection(info, { skip: ['users.*'] }); // more obvious notation
     *
     * If you want to skip only exact fields, it can be done as:
     * fieldsMap(info, { skip: ['users.email', 'users.password'] })
     */
    skip?: string[];
}

/**
 * Type definition for variables values map
 *
 * @access public
 */
export interface VariablesValues {
    [name: string]: any;
}

/**
 * Fields projection object, where keys are dot-notated field paths
 * ended-up with a truthy (1) value
 *
 * @access public
 */
export interface FieldsProjection {
    [name: string]: 1;
}

/**
 * Traverse query nodes tree options arg interface
 * @access private
 */
interface TraverseOptions {
    fragments: FragmentItem;
    vars: any;
    withVars?: boolean;
}

/**
 * Retrieves a list of nodes from a given selection (either fragment or
 * selection node)
 *
 * @param {FragmentDefinitionNode | FieldNode} selection
 * @return {ReadonlyArray<FieldNode>}
 * @access private
 */
function getNodes(
    selection: FragmentDefinitionNode | SelectionNode,
): ReadonlyArray<SelectionNode> {
	return (selection as any)?.selectionSet?.selections || [] as ReadonlyArray<SelectionNode>;
}

/**
 * Checks if a given directive name and value valid to return a field
 *
 * @param {string} name
 * @param {boolean} value
 * @return boolean
 * @access private
 */
function checkValue(name: string, value: boolean): boolean {
    return name === 'skip'
        ? !value
        : name === 'include' ? value : true
    ;
}

/**
 * Checks if a given directive arg allows to return field
 *
 * @param {string} name - directive name
 * @param {ArgumentNode} arg
 * @param {VariablesValues} vars
 * @return {boolean}
 * @access private
 */
function verifyDirectiveArg(
    name: string,
    arg: ArgumentNode,
    vars: VariablesValues
): boolean {
    switch (arg.value.kind) {
        case 'BooleanValue':
            return checkValue(name, arg.value.value);
        case 'Variable':
            return checkValue(name, vars[arg.value.name.value]);
    }

    return true;
}

/**
 * Checks if a given directive allows to return field
 *
 * @param {DirectiveNode} directive
 * @param {VariablesValues} vars
 * @return {boolean}
 * @access private
 */
function verifyDirective(
    directive: DirectiveNode,
    vars: VariablesValues,
): boolean {
    const directiveName: string = directive.name.value;

    if (!~['include', 'skip'].indexOf(directiveName)) {
        return true;
    }

    let args: any[] = directive.arguments as any[];

    if (!(args && args.length)) {
        args = [];
    }

    for (const arg of args) {
        if (!verifyDirectiveArg(directiveName, arg, vars)) {
            return false;
        }
    }

    return true;
}

/**
 * Checks if a given list of directives allows to return field
 *
 * @param {ReadonlyArray<DirectiveNode>} directives
 * @param {VariablesValues} vars
 * @return {boolean}
 * @access private
 */
function verifyDirectives(
    directives: ReadonlyArray<DirectiveNode> | undefined,
    vars: VariablesValues,
): boolean {
    if (!directives || !directives.length) {
        return true;
    }

    vars = vars || {};

    for (const directive of directives) {
        if (!verifyDirective(directive, vars)) {
            return false;
        }
    }

    return true;
}

type SkipValue = boolean | SkipTree;
type SkipTree = { [key: string]: SkipValue };

/**
 * Checks if a given node is inline fragment and process it,
 * otherwise does nothing and returns false.
 *
 * @param {SelectionNode} node
 * @param {*} root
 * @param {*} skip
 * @param {TraverseOptions} opts
 */
function verifyInlineFragment(
    node: SelectionNode,
    root: MapResultKey,
    opts: TraverseOptions,
    skip: SkipValue,
): boolean {
    if (node.kind === 'InlineFragment') {
        const nodes = getNodes(node);

        nodes.length && traverse(nodes, root, opts, skip);

        return true;
    }

    return false;
}

/**
 * Builds skip rules tree from a given skip option argument
 *
 * @param {string[]} skip - skip option arguments
 * @return {SkipTree} - skip rules tree
 */
function skipTree(skip: string[]): SkipTree {
    const tree: SkipTree = {};

    for (const pattern of skip) {
        const props = pattern.split('.');
        let propTree: SkipValue = tree;

        for (let i = 0, s = props.length; i < s; i++) {
            const prop = props[i];
            const all = props[i + 1] === '*';

            if (!propTree[prop]) {
                propTree[prop] = i === s - 1 || all ? true : {};
                all && i++;
            }

            propTree = propTree[prop];
        }
    }

    return tree;
}

/**
 *
 * @param node
 * @param skip
 */
function verifySkip(node: string, skip: SkipValue): SkipValue {
    if (!skip) {
        return false;
    }

    if (skip[node]) {
        return skip[node];
    }

    // lookup through wildcard patterns
    let nodeTree: SkipValue = false;
    const patterns = Object.keys(skip).filter(pattern => ~pattern.indexOf('*'));

    for (const pattern of patterns) {
        const rx: RegExp = new RegExp(pattern.replace(RX_AST, '.*'));

        if (rx.test(node)) {
            nodeTree = skip[pattern];

            if (nodeTree === true) {
                break;
            }
        }
    }

    return nodeTree;
}

type MapResultKey = false | MapResult;
export type MapResult = { [key: string]: MapResultKey };

/**
 * Traverses recursively given nodes and fills-up given root tree with
 * a requested field names
 *
 * @param {ReadonlyArray<FieldNode>} nodes
 * @param {MapResultKey} root
 * @param {TraverseOptions} opts
 * @param {SkipValue} skip
 * @return {MapResultKey}
 * @access private
 */
function traverse<T extends MapResultKey>(
    nodes: ReadonlyArray<SelectionNode>,
    root: T,
    opts: TraverseOptions,
    skip: SkipValue,
): T {
    for (const node of nodes) {
        if (opts.withVars && !verifyDirectives(node.directives, opts.vars)) {
            continue;
        }

        if (verifyInlineFragment(node, root, opts, skip)) {
            continue;
        }

        const name = (node as FieldNode).name.value;

        if (opts.fragments[name]) {
            traverse(getNodes(opts.fragments[name]), root, opts, skip);
            continue;
        }

        const nodes = getNodes(node);
        const nodeSkip = verifySkip(name, skip);

        if (nodeSkip !== true) {
            root[name] = root[name] || (nodes.length ? {} : false);
            nodes.length && traverse(
                nodes,
                root[name],
                opts,
                nodeSkip,
            );
        }
    }

    return root;
}

/**
 * Retrieves and returns a branch from a given tree by a given path
 *
 * @param {MapResult} tree
 * @param {string} [path]
 * @return {MapResultKey}
 * @access private
 */
function getBranch(tree: MapResult, path?: string): MapResultKey {
    if (!path) {
        return tree;
    }

	let branch: MapResultKey = tree;
    for (const fieldName of path.split('.')) {
        if (!branch[fieldName]) {
            return {};
        }

        branch = branch[fieldName];
    }

    return branch;
}

/**
 * Verifies if a given info object is valid. If valid - returns
 * proper FieldNode object for given resolver node, otherwise returns null.
 *
 * @param {GraphQLResolveInfo} info
 * @return {FieldNode | null}
 * @access private
 */
function verifyInfo(info: GraphQLResolveInfo): SelectionNode | null {
    if (!info) {
        return null;
    }

    if (!info.fieldNodes && (info as any).fieldASTs) {
        (info as any).fieldNodes = (info as any).fieldASTs;
    }

    if (!info.fieldNodes) {
        return null;
    }

    return verifyFieldNode(info);
}

/**
 * Verifies if a proper fieldNode existing on given info object
 *
 * @param {GraphQLResolveInfo} info
 * @return {FieldNode | null}
 * @access private
 */
function verifyFieldNode(info: GraphQLResolveInfo): FieldNode | null {
    const fieldNode: FieldNode | undefined = info.fieldNodes.find(
        (node: FieldNode) =>
            node && node.name && node.name.value === info.fieldName
    );

    if (!(fieldNode && fieldNode.selectionSet)) {
        return null;
    }

    return fieldNode;
}

/**
 * Parses input options and returns prepared options object
 *
 * @param {FieldsListOptions} options
 * @return {FieldsListOptions}
 * @access private
 */
function parseOptions(options?: FieldsListOptions): FieldsListOptions {
    if (!options) {
        return {};
    }

    if (options.withDirectives === undefined) {
        options.withDirectives = true;
    }

    return options;
}

/**
 * Extracts and returns requested fields tree. 
 * May return `false` if path option is pointing to leaf of tree
 *
 * @param {GraphQLResolveInfo} info
 * @param {FieldsListOptions} options
 * @access public
 */
export function fieldsMap(
    info: GraphQLResolveInfo,
    options?: FieldsListOptions,
): MapResultKey {
    const fieldNode = verifyInfo(info);

    if (!fieldNode) {
        return {};
    }

    const { path, withDirectives, skip } = parseOptions(options);
    const tree = traverse(getNodes(fieldNode), {}, {
            fragments: info.fragments,
            vars: info.variableValues,
            withVars: withDirectives,
        },
        skipTree(skip || []),
    );

    return getBranch(tree, path);
}

/**
 * Extracts list of selected fields from a given GraphQL resolver info
 * argument and returns them as an array of strings, using the given
 * extraction options.
 *
 * @param {GraphQLResolveInfo} info - GraphQL resolver info object
 * @param {FieldsListOptions} [options] - fields list extraction options
 * @return {string[]} - array of field names
 * @access public
 */
export function fieldsList(
    info: GraphQLResolveInfo,
    options: FieldsListOptions = {},
): string[] {
    return Object.keys(fieldsMap(info, options))
        .map((field: string) => options.transform?.[field] || field);
}

/**
 * Combines parent path with child name to fully-qualified dot-notation path
 * of a child
 *
 * @param {string} parent
 * @param {string} child
 * @return {string}
 * @access private
 */
function toDotNotation(parent: string, child: string): string {
    return `${parent ? parent + '.' : ''}${child}`
}

/**
 * Extracts projection of selected fields from a given GraphQL resolver info
 * argument and returns flat fields projection object, where keys are object
 * paths in dot-notation form.
 *
 * @param {GraphQLResolveInfo} info - GraphQL resolver info object
 * @param {FieldsListOptions} options - fields list extraction options
 * @return {FieldsProjection} - fields projection object
 * @access public
 */
export function fieldsProjection(
    info: GraphQLResolveInfo,
    options?: FieldsListOptions,
): FieldsProjection {
    const tree = fieldsMap(info, options);
    const stack: any[] = [];
    const map: FieldsProjection = {};
    const transform = (options || {}).transform || {};

    stack.push({ node: '', tree });

    while (stack.length) {
        for (const j of Object.keys(stack[0].tree)) {
            if (stack[0].tree[j]) {
                const nodeDottedName = toDotNotation(stack[0].node, j);
                stack.push({
                    node: nodeDottedName,
                    tree: stack[0].tree[j],
                });

                if (options?.keepParentField) map[nodeDottedName] = 1;

                continue;
            }

            let dotName = toDotNotation(stack[0].node, j);

            if (transform[dotName]) {
                dotName = transform[dotName];
            }

            map[dotName] = 1;
        }
        stack.shift();
    }

    return map;
}

// istanbul ignore next
if (process.env['IS_UNIT_TEST']) {
    // noinspection JSUnusedGlobalSymbols
    Object.assign(module.exports, {
        getNodes,
        traverse,
        getBranch,
        verifyDirectives,
        verifyDirective,
        verifyDirectiveArg,
        checkValue,
        verifyInfo,
        verifyFieldNode,
        verifyInlineFragment,
        verifySkip,
        parseOptions,
        toDotNotation,
    });
}
