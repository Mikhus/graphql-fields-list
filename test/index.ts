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
process.env['IS_UNIT_TEST'] = "1";

import { expect } from 'chai';
import { graphql, GraphQLResolveInfo } from 'graphql';
import { fieldsList, fieldsMap } from '..';
import { schema, resolveInfo, query } from './mocks/schema';

const { getNodes } = require('..');

describe('module "graphql-fields-list"', () => {
    let info: GraphQLResolveInfo;

    before(async () => {
        await graphql(schema, query, null);
        info = resolveInfo.shift();
    });

    describe('@public: fieldsList()', () => {
        it('should be a function', () => {
            expect(typeof fieldsList).equals('function');
        });

        it('should extract proper fields', () => {
            expect(fieldsList(info))
                .deep.equals([
                    'users',
                ]);
            expect(fieldsList(info, { path: 'users' }))
                .deep.equals([
                    'pageInfo',
                    'edges',
            ]);
            expect(fieldsList(info, { path: 'users.edges.node' }))
                .deep.equals([
                    'id',
                    'firstName',
                    'lastName',
                    'phoneNumber',
                    'email',
                ]);
            expect(fieldsList(info, { path: 'users.pageInfo' }))
                .deep.equals([
                    'startCursor',
                    'endCursor',
                    'hasNextPage',
                ]);
        });

        it('should return empty array if there are no fields at path', () => {
            expect(fieldsList(info, { path: 'users.pageInfo.endCursor' }))
                .deep.equals([]);
            expect(fieldsList(info, { path: 'users.invalidNode' }))
                .deep.equals([]);
        });
    });

    describe('@public: fieldsMap()', () => {
        it('should be a function', () => {
            expect(typeof fieldsMap).equals('function');
        });

        it('should return correct fields map object', () => {
            expect(fieldsMap(info))
                .deep.equals({
                    users: {
                        pageInfo: {
                            startCursor: false,
                            endCursor: false,
                            hasNextPage: false,
                        },
                        edges: {
                            node: {
                                id: false,
                                firstName: false,
                                lastName: false,
                                phoneNumber: false,
                                email: false,
                            },
                        },
                    },
                });
            expect(fieldsMap(info, 'users.edges.node'))
                .deep.equals({
                    id: false,
                    firstName: false,
                    lastName: false,
                    phoneNumber: false,
                    email: false,
                });
        });

        it('should return empty object if there are no selection nodes', () => {
           expect(fieldsMap({} as any)).deep.equals({});
        });

        it('should return empty object if there is no matching root node', ()=>{
            expect(fieldsMap({ fieldNodes: [] } as any))
                .deep.equals({});
            expect(fieldsMap({ fieldNodes: false, fieldName: 'bla' } as any))
                .deep.equals({});
            expect(fieldsMap({ fieldNodes: null } as any))
                .deep.equals({});
            expect(fieldsMap({ fieldNodes: [{ a: 1 }] } as any))
                .deep.equals({});
        });
    });

    describe('@private: getNodes()', () => {
        it('should be a function', () => {
            expect(typeof getNodes).equals('function');
        });
        it('should return empty array if wrong argument passed', () => {
            expect(getNodes()).deep.equals([]);
            expect(getNodes({})).deep.equals([]);
            expect(getNodes({ selectionSet: null })).deep.equals([]);
            expect(getNodes({ selectionSet: { selections: null } }))
                .deep.equals([]);
            expect(getNodes({ selectionSet: true })).deep.equals([]);
        });
    });
});
