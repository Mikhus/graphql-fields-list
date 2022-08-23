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
    GraphQLObjectType,
    GraphQLSchema,
    GraphQLString,
    GraphQLResolveInfo,
    graphql,
    GraphQLFloat,
    GraphQLBoolean,
    GraphQLList,
} from 'graphql';
import {
    connectionDefinitions,
    connectionArgs,
    nodeDefinitions,
    fromGlobalId,
    globalIdField,
    connectionFromArray,
} from 'graphql-relay';
import * as uuid from 'uuid';

export const resolveInfo: { [queryId: string]: GraphQLResolveInfo } = {};

export const { nodeInterface, nodeField } = nodeDefinitions(async (
    globalId: string
) => {
    const { type, id } = fromGlobalId(globalId);
    const node: any = { id, __typename: type };

    return node;
});

const Stats = new GraphQLObjectType({
    name: 'Stats',
    interfaces: [nodeInterface],
    fields: {
        id: globalIdField('Stats', (stats: any) => stats.id),
        points: { type: GraphQLFloat },
        assists: { type: GraphQLBoolean },
    },
});

const User = new GraphQLObjectType({
    name: 'User',
    interfaces: [nodeInterface],
    fields: {
        id: globalIdField('User', (user: any) => user.id),
        firstName: { type: GraphQLString },
        lastName: { type: GraphQLString },
        phoneNumber: { type: GraphQLString },
        email: { type: GraphQLString },
        address: { type: GraphQLString },
        stats: { type: Stats },
    },
});

export const { connectionType: userConnection } =
    connectionDefinitions({ nodeType: User });

const Team = new GraphQLObjectType({
    name: 'Team',
    interfaces: [nodeInterface],
    fields: {
        id: globalIdField('Team', (team: any) => team.id),
        name: { type: GraphQLString },
        stats: { type: Stats },
        users: { type: new GraphQLList(User) },
    },
});

export const { connectionType: teamConnection } =
    connectionDefinitions({ nodeType: Team });

const Viewer = new GraphQLObjectType({
    name: 'Viewer',
    fields: {
        users: {
            type: userConnection,
            args: { ...connectionArgs },
        },
        teams: {
            type: teamConnection,
            args: { ...connectionArgs },
        },
    },
});

const Query = new GraphQLObjectType({
    name: 'Query',
    fields: {
        node: nodeField,
        viewer: {
            type: Viewer,
            resolve(src: any, args: any, context: any, info: any) {
                resolveInfo[context.queryId] = info;
                return connectionFromArray([], args);
            },
        },
    },
});

export const schema = new GraphQLSchema({
    query: Query,
});

/**
 * Executes a test query and returns resolver info object
 *
 * @param {string} query
 * @param {*} vars
 * @return {GraphQLResolveInfo}
 */
export async function exec(query: string, vars: any) {
    const queryId = uuid.v4();
    await graphql(schema, query, null, { queryId }, vars);
    const info: GraphQLResolveInfo = resolveInfo[queryId]!;
    delete  resolveInfo[queryId];

    return info;
}

