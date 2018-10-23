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
    FieldNode,
    FragmentDefinitionNode,
    GraphQLResolveInfo,
} from 'graphql';

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
    path?: string;
    transform?: FieldNamesMap;
    withDirectives?: boolean;
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
 * Retrieves a list of nodes from a given selection (either fragment or
 * selection node)
 *
 * @param {FragmentDefinitionNode | FieldNode} selection
 * @return {ReadonlyArray<FieldNode>}
 * @access private
 */
function getNodes(
    selection: FragmentDefinitionNode | FieldNode,
): ReadonlyArray<FieldNode> {
    return (((selection || {} as any)
        .selectionSet || {} as any
    ).selections || []) as ReadonlyArray<FieldNode>;
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

    let args = directive.arguments;

    if (!(args && args.length)) {
        args = [];
    }

    for (let arg of args) {
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

    for (let directive of directives) {
        if (!verifyDirective(directive, vars)) {
            return false;
        }
    }

    return true;
}

/**
 * Traverses recursively given nodes and fills-up given root tree with
 * a requested field names
 *
 * @param {ReadonlyArray<FieldNode>} nodes
 * @param {FragmentItem} fragments
 * @param {*} root
 * @param {VariablesValues} vars
 * @param {boolean} [withVars]
 * @access private
 */
function traverse(
    nodes: ReadonlyArray<FieldNode>,
    fragments: FragmentItem,
    root: any,
    vars: any,
    withVars?: boolean
) {
    for (let node of nodes) {
        if (withVars && !verifyDirectives(node.directives, vars)) {
            continue;
        }

        const name = node.name.value;
        const fragment = fragments[name];

        if (fragment) {
            traverse(getNodes(fragment), fragments, root, withVars, vars);
            continue;
        }

        root[name] = root[name] || {};

        if (node.selectionSet && node.selectionSet.selections) {
            traverse(getNodes(node), fragments, root[name], withVars, vars);
        } else {
            root[name] = false;
        }
    }

    return root;
}

/**
 * Retrieves and returns a branch from a given tree by a given path
 *
 * @param {*} tree
 * @param {string} [path]
 * @return {*}
 * @access private
 */
function getBranch(tree: any, path?: string): any {
    if (!path) {
        return tree;
    }

    for (let fieldName of path.split('.')) {
        if (!tree[fieldName]) {
            return {};
        }

        tree = tree[fieldName];
    }

    return tree;
}

/**
 * Extracts and returns requested fields tree
 *
 * @param {GraphQLResolveInfo} info
 * @param {string} path
 * @param {boolean} [withDirectives]
 * @access public
 */
export function fieldsMap(
    info: GraphQLResolveInfo,
    path?: string,
    withDirectives: boolean = true,
) {
    if (!info || !(info.fieldNodes || (info as any).fieldASTs)) {
        return {};
    }

    // support for versions of graphql under 0.8.0
    if (!info.fieldNodes && (info as any).fieldASTs) {
        (info as any).fieldNodes = (info as any).fieldASTs;
    }

    const fieldNode: FieldNode | undefined = info.fieldNodes.find(
        (node: FieldNode) =>
            node && node.name && node.name.value === info.fieldName
    );

    if (!(fieldNode && fieldNode.selectionSet)) {
        return {};
    }

    let tree = traverse(
        fieldNode.selectionSet.selections as ReadonlyArray<FieldNode>,
        info.fragments,
        {},
        info.variableValues,
        withDirectives,
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
) {
    if (options.withDirectives === undefined) {
        options.withDirectives = true;
    }

    return Object.keys(fieldsMap(info, options.path, options.withDirectives))
        .map((field: string) =>
            (options.transform || {})[field] || field
        );
}

// istanbul ignore next
if (process.env['IS_UNIT_TEST']) {
    Object.assign(module.exports, {
        getNodes,
        traverse,
        getBranch,
        verifyDirectives,
        verifyDirective,
        verifyDirectiveArg,
        checkValue
    });
}
