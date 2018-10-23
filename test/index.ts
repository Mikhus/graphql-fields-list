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
import { GraphQLResolveInfo } from 'graphql';
import { fieldsList, fieldsMap } from '..';
import { exec } from './mocks/schema';

const {
    getNodes,
    checkValue,
    verifyDirectiveArg,
    verifyDirective,
} = require('..');

const query = `
query UsersQuery($withPageInfo: Boolean!) {
  viewer {
    users {
        ...PageInfo
        ...UserData
    }
  }
}
fragment PageInfo on UserConnection {
  pageInfo  @include(if: $withPageInfo) {
    startCursor
    endCursor
    hasNextPage @skip(if: false)
  }
}
fragment UserContacts on User {
  phoneNumber
  email
}
fragment UserData on UserConnection {
  edges {
    node {
      id
      firstName
      lastName
      ...UserContacts
    }
  }
}`;

describe('module "graphql-fields-list"', () => {
    let info: GraphQLResolveInfo;

    before(async () => {
        info = await exec(query, { withPageInfo: true });
    });

    it('should support old version', () => {
        (info as any).fieldASTs = info.fieldNodes;
        delete (info as any).fieldNodes;
        expect(fieldsList(info))
            .deep.equals([
            'users',
        ]);
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

        it('should treat withDirectives option as enabled by default',
            async () =>
        {
            const info = await exec(query, { withPageInfo: false });
            expect(fieldsList(info, { path: 'users.pageInfo' }))
                .deep.equals(
                    fieldsList(info, {
                        path: 'users.pageInfo',
                        withDirectives: true
                    })
                );
            expect(fieldsList(info, { path: 'users.pageInfo' }))
                .not.deep.equals(
                    fieldsList(info, {
                        path: 'users.pageInfo',
                        withDirectives: false
                    })
                );
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

        it('should return empty object if there is no matching root node',
            () =>
        {
            expect(fieldsMap({ fieldNodes: [] } as any))
                .deep.equals({});
            expect(fieldsMap({ fieldNodes: false, fieldName: 'bla' } as any))
                .deep.equals({});
            expect(fieldsMap({ fieldNodes: null } as any))
                .deep.equals({});
            expect(fieldsMap({ fieldNodes: [{ a: 1 }] } as any))
                .deep.equals({});
        });

        it('should treat withDirectives option as enabled by default',
            async () =>
        {
            const info = await exec(query, { withPageInfo: false });
            expect(fieldsMap(info, 'users.pageInfo'))
                .deep.equals(fieldsMap(info, 'users.pageInfo', true));
            expect(fieldsMap(info, 'users.pageInfo'))
                .not.deep.equals(fieldsMap(info, 'users.pageInfo', false));
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

    describe('@private: checkValue()', () => {
        it('should return true if given directive name is unsupported', () => {
            expect(checkValue('unknownDirective', true)).equals(true);
            expect(checkValue('unknownDirective', false)).equals(true);
        });
        it('should return should return controversial value for "skip"', () => {
            expect(checkValue('skip', true)).equals(false);
            expect(checkValue('skip', false)).equals(true);
        });
        it('should return should return the same value for "include"', () => {
            expect(checkValue('include', true)).equals(true);
            expect(checkValue('include', false)).equals(false);
        });
    });

    describe('@private: verifyDirectiveArg()', () => {
        it('should return true if given arg is not supported', () => {
            expect(verifyDirectiveArg(
                'skip',
                { value: { kind: 'NonSupported' } }
            )).equals(true);
        });
    });

    describe('@private: verifyDirective()', () => {
        it('should return true if given directive is not supported', () => {
            expect(verifyDirective({
                name: { value: 'unsupportedDirective' },
            })).equals(true);
        });
        it('should return true if given directive arguments are invalid',
            () =>
        {
            expect(verifyDirective({
                name: { value: 'skip' },
            })).equals(true);
            expect(verifyDirective({
                name: { value: 'skip' },
                arguments: null
            })).equals(true);
            expect(verifyDirective({
                name: { value: 'skip' },
                arguments: []
            })).equals(true);
            expect(verifyDirective({
                name: { value: 'skip' },
                arguments: true
            })).equals(true);
        });
    });
});
