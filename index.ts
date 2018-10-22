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
 * Traverses recursively given nodes and fills-up given root tree with
 * a requested field names
 *
 * @param {ReadonlyArray<FieldNode>} nodes
 * @param {FragmentItem} fragments
 * @param {*} root
 * @access private
 */
function traverse(
    nodes: ReadonlyArray<FieldNode>,
    fragments: FragmentItem,
    root: any,
) {
    for (let node of nodes) {
        const name = node.name.value;
        const fragment = fragments[name];

        if (fragment) {
            traverse(getNodes(fragment), fragments, root);
            continue;
        }

        root[name] = root[name] || {};

        if (node.selectionSet && node.selectionSet.selections) {
            traverse(getNodes(node), fragments, root[name]);
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
 * @access public
 */
export function fieldsMap(
    info: GraphQLResolveInfo,
    path?: string
) {
    if (!info || !info.fieldNodes) {
        return {};
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
    );

    return getBranch(tree, path);
}

/**
 * Extracts list of selected fields from a given GraphQL resolver info
 * argument and returns them as an array of strings, using the given
 * extraction options.
 *
 * @example
 * ```javascript
 *
 * const fieldsList = require('graphql-fields-list');
 * // assuming there will be resolver definition in the code:
 * {
 *     // ...
 *     resolve(info, args, context) {
 *         const fields = fieldsList(info);
 *         // or
 *         const fields = fieldsList(info, { path: 'edges.node' })
 *         // or
 *         const fields = fieldList(info, { transform: { id: '_id' } });
 *         // or
 *         const fields = fieldsList(info, {
 *
 *            // this will select all fields for an object nested
 *             // under specified path in th request fields object tree
 *             path: 'edges.node',
 *
 *             // this will transform field names from request to
 *             // a desired values. For example in graphql you may want to
 *             // have field named 'id', but would like to retrieve a value
 *             // from mongodb associated with this field, which is stored
 *             // under database field named '_id'
 *             transform: { id: '_id' }
 *
 *         });
 *
 *         // now we can bypass list of fields to some
 *         // service or database query, etc. whatever we need
 *         const data = callForSomeDataSomeServiceOrDatabase(fields);
 *         return data;
 *     }
 * }
 * ```
 * @param {GraphQLResolveInfo} info - GraphQL resolver info object
 * @param {FieldsListOptions} [options] - fields list extraction options
 * @return {string[]} - array of field names
 * @access public
 */
export function fieldsList(
    info: GraphQLResolveInfo,
    options: FieldsListOptions = {},
) {
    return Object.keys(fieldsMap(info, options.path))
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
    });
}
