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
import { fieldsList, fieldsMap, fieldsProjection } from '..';
import { exec } from './mocks/schema';

const {
    getNodes,
    checkValue,
    verifyDirectiveArg,
    verifyDirective,
    verifyDirectives,
    verifyInfo,
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
      ... on User {
        address
      }
    }
  }
}`;

// todo: teams query with recursive stats on team and user

const teamQuery = `query {
    viewer {
        teams {
            edges {
                node {
                    id
                    gameStats: stats {
                        id
                        points
                    }
                    users {
                        id
                        stats {
                            id
                            points
                            assists
                        }
                    }
                }
            }
        }
    }
}`;

describe('module "graphql-fields-list"', () => {
    let info: GraphQLResolveInfo;
    let teamInfo: GraphQLResolveInfo;

    before(async () => {
        info = await exec(query, { withPageInfo: true });
        teamInfo = await exec(teamQuery, {});
    });

    it('should support old version', () => {
        (info as any).fieldASTs = info.fieldNodes;
        delete (info as any).fieldNodes;
        expect(fieldsList(info))
            .deep.equals([
            'users',
        ]);
    });

    describe('@public: fieldsProjection()', () => {
        it('should be a function', () => {
            expect(typeof fieldsProjection).equals('function');
        });

        it('should extract proper fields', () => {
            expect(fieldsProjection(info)).deep.equals({
                'users.pageInfo.startCursor': 1,
                'users.pageInfo.endCursor': 1,
                'users.pageInfo.hasNextPage': 1,
                'users.edges.node.id': 1,
                'users.edges.node.firstName': 1,
                'users.edges.node.lastName': 1,
                'users.edges.node.phoneNumber': 1,
                'users.edges.node.email': 1,
                'users.edges.node.address': 1,
            });
            expect(fieldsProjection(info, {
                path: 'users',
            })).deep.equals({
                'pageInfo.startCursor': 1,
                'pageInfo.endCursor': 1,
                'pageInfo.hasNextPage': 1,
                'edges.node.id': 1,
                'edges.node.firstName': 1,
                'edges.node.lastName': 1,
                'edges.node.phoneNumber': 1,
                'edges.node.email': 1,
                'edges.node.address': 1,
            });
            expect(fieldsProjection(info, {
                path: 'users.edges.node',
            })).deep.equals({
                'id': 1,
                'firstName': 1,
                'lastName': 1,
                'phoneNumber': 1,
                'email': 1,
                'address': 1,
            });
            expect(fieldsProjection(info, {
                path: 'users.edges',
                transform: {
                    'node.id': 'node._id',
                    'node.firstName': 'node.given_name',
                    'node.lastName': 'node.family_name',
                },
            })).deep.equals({
                'node._id': 1,
                'node.given_name': 1,
                'node.family_name': 1,
                'node.phoneNumber': 1,
                'node.email': 1,
                'node.address': 1,
            });
        });

        it('should extract proper fields if keepParentField is specified', () => {
            expect(
                fieldsProjection(info, { keepParentField: true })
            ).deep.equals({
                users: 1,
                "users.edges": 1,
                "users.edges.node": 1,
                "users.pageInfo": 1,
                "users.pageInfo.startCursor": 1,
                "users.pageInfo.endCursor": 1,
                "users.pageInfo.hasNextPage": 1,
                "users.edges.node.id": 1,
                "users.edges.node.firstName": 1,
                "users.edges.node.lastName": 1,
                "users.edges.node.phoneNumber": 1,
                "users.edges.node.email": 1,
                "users.edges.node.address": 1,
            });
            expect(
                fieldsProjection(info, {
                    path: "users",
                    keepParentField: true,
                })
            ).deep.equals({
                edges: 1,
                "edges.node": 1,
                pageInfo: 1,
                "pageInfo.startCursor": 1,
                "pageInfo.endCursor": 1,
                "pageInfo.hasNextPage": 1,
                "edges.node.id": 1,
                "edges.node.firstName": 1,
                "edges.node.lastName": 1,
                "edges.node.phoneNumber": 1,
                "edges.node.email": 1,
                "edges.node.address": 1,
            });
            expect(
                fieldsProjection(info, {
                    skip: ["users.pageInfo"],
                    path: "users",
                    keepParentField: true,
                })
            ).deep.equals({
                edges: 1,
                "edges.node": 1,
                "edges.node.id": 1,
                "edges.node.firstName": 1,
                "edges.node.lastName": 1,
                "edges.node.phoneNumber": 1,
                "edges.node.email": 1,
                "edges.node.address": 1,
            });
            expect(fieldsProjection(info, {
                path: 'users.edges.node',
                keepParentField: true,
            })).deep.equals({
                'id': 1,
                'firstName': 1,
                'lastName': 1,
                'phoneNumber': 1,
                'email': 1,
                'address': 1,
            });
            expect(fieldsProjection(info, {
                path: 'users.edges',
                keepParentField: true,
                transform: {
                    'node.id': 'node._id',
                    'node.firstName': 'node.given_name',
                    'node.lastName': 'node.family_name',
                },
            })).deep.equals({
                "node": 1,
                'node._id': 1,
                'node.given_name': 1,
                'node.family_name': 1,
                'node.phoneNumber': 1,
                'node.email': 1,
                'node.address': 1,
            });
        });

        it('should properly transform field names', () => {
            expect(fieldsProjection(info, {
                path: 'users.edges.node',
                transform: {
                    'id': '_id',
                },
            })).deep.equals({
                '_id': 1,
                'firstName': 1,
                'lastName': 1,
                'phoneNumber': 1,
                'email': 1,
                'address': 1,
            });

            expect(fieldsProjection(info, {
                transform: {
                    'users.edges.node.id': 'users.edges.node._id',
                },
            })).deep.equals({
                'users.pageInfo.startCursor': 1,
                'users.pageInfo.endCursor': 1,
                'users.pageInfo.hasNextPage': 1,
                'users.edges.node._id': 1,
                'users.edges.node.firstName': 1,
                'users.edges.node.lastName': 1,
                'users.edges.node.phoneNumber': 1,
                'users.edges.node.email': 1,
                'users.edges.node.address': 1,
            });
        });

        it('should properly skip configured fields', () => {
            expect(fieldsProjection(info, {
                skip: [
                    'users.pageInfo.*',
                    'users.edges.node.email',
                    'users.edges.node.address',
                    'users.edges.node.*Name',
                ],
                transform: {
                    'users.edges.node.id': 'users.edges.node._id',
                },
            })).deep.equals({
                'users.edges.node._id': 1,
                'users.edges.node.phoneNumber': 1,
            });
        })
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
                    'address',
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
                                address: false,
                            },
                        },
                    },
                });
            expect(fieldsMap(info, { path: 'users.edges.node' }))
                .deep.equals({
                    id: false,
                    firstName: false,
                    lastName: false,
                    phoneNumber: false,
                    email: false,
                    address: false,
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
            expect(fieldsMap(info, { path: 'users.pageInfo' }))
                .deep.equals(fieldsMap(info, {
                    path: 'users.pageInfo',
                    withDirectives: true,
                }));
            expect(fieldsMap(info, { path: 'users.pageInfo' }))
                .not.deep.equals(fieldsMap(info, {
                    path: 'users.pageInfo',
                    withDirectives: false
                }));
        });

        it('should properly skip configured fields', () => {
            expect(fieldsMap(info, { skip: ['users.pageInfo'] }))
                .deep.equals({
                    users: {
                        edges: {
                            node: {
                                id: false,
                                firstName: false,
                                lastName: false,
                                phoneNumber: false,
                                email: false,
                                address: false,
                            },
                        },
                    },
                });
            expect(fieldsMap(info, { skip: [
                'users.pageInfo.hasNextPage',
                'users.edges.node.email',
                'users.edges.node.address',
            ]})).deep.equals({
                users: {
                    pageInfo: {
                        startCursor: false,
                        endCursor: false,
                    },
                    edges: {
                        node: {
                            id: false,
                            firstName: false,
                            lastName: false,
                            phoneNumber: false,
                        },
                    },
                },
            });
        });

        it('should properly skip configured fields having wildcards', () => {
            expect(fieldsMap(info, { skip: [
                'users.pageInfo.*',
                'users.edges.node.email',
                'users.edges.node.address',
                'users.edges.node.*Name',
            ]})).deep.equals({
                users: {
                    edges: {
                        node: {
                            id: false,
                            phoneNumber: false,
                        },
                    },
                },
            });
        });

        it('should return recursive object defs properly', () => {
            expect(fieldsMap(teamInfo, { path: 'teams.edges.node' }))
                .deep.equals({
                    id: false,
                    stats: {
                        id: false,
                        points: false
                    },
                    users: {
                        id: false,
                        stats: {
                            id: false,
                            points: false,
                            assists: false
                        },
                    },
                });
        });

        it('should return empty object if given path is a tree leaf', () => {
            expect(fieldsMap(teamInfo, { path: 'teams.edges.node.id' }))
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
            expect(verifyDirective({ name: { value: 'skip' } })).equals(true);
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

    describe('@private: verifyInfo()', () => {
        it('should return null if wrong info object bypassed', () => {
            expect(verifyInfo(null)).equals(null);
            expect(verifyInfo('')).equals(null);
            expect(verifyInfo(false)).equals(null);
            expect(verifyInfo()).equals(null);
        });
    });

    describe('@private: verifyDirectives()', () => {
        it('should not throw if invalid vars value passed', () => {
            expect(() => verifyDirectives([{ name: { value: 'skip' }}]))
                .to.not.throw(Error);
        });
    });
});
