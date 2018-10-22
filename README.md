# graphql-fields-list

[![Build Status](https://travis-ci.org/Mikhus/graphql-fields-list.svg?branch=master)](https://travis-ci.org/Mikhus/graphql-fields-list)
[![codebeat badge](https://codebeat.co/badges/0bdd4ca4-7a15-4c7b-95bd-bbfd52230b50)](https://codebeat.co/projects/github-com-mikhus-graphql-fields-list-master)
[![David](https://img.shields.io/david/Mikhus/graphql-fields-list.svg)](https://david-dm.org/Mikhus/graphql-fields-list)
[![David](https://img.shields.io/david/dev/Mikhus/graphql-fields-list.svg)](https://david-dm.org/Mikhus/graphql-fields-list?type=dev)
[![Known Vulnerabilities](https://snyk.io/test/github/Mikhus/graphql-fields-list/badge.svg?targetFile=package.json)](https://snyk.io/test/github/Mikhus/graphql-fields-list?targetFile=package.json)
[![License](https://img.shields.io/badge/license-ISC-blue.svg)](https://rawgit.com/imqueue/core/master/LICENSE)

Add-on to work with GraphQLResolveInfo which helps to extract requested
fields list for a particular object resolver. This helps to bypass
requested fields data to underlying services or data sources to extract
only those minimal parts of data which was requested by end-user.

**TypeScript Included!!!**

## Install

~~~bash
npm i graphql-fields-list
~~~

With JavaScript:
~~~javascript
const { fieldsList, fieldsMap } = require('graphql-fields-list');
~~~

With TypeScript:
~~~typescript
import { fieldsList, fieldsMap } from 'graphql-fields-list';
~~~

## Motivation and Usage

Let's assume we have the following GraphQL schema:

~~~graphql
interface Node {
  id: ID!
}
type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}
type Query {
  node(id: ID!): Node
  viewer: Viewer
}
type User implements Node {
  id: ID!
  firstName: String
  lastName: String
  phoneNumber: String
  email: String
}
type UserConnection {
  pageInfo: PageInfo!
  edges: [UserEdge]
}
type UserEdge {
  node: User
  cursor: String!
}
type Viewer {
  users(
    after: String,
    first: Int,
    before: String,
    last: Int
  ): UserConnection
}
~~~

And using the query:

~~~graphql
query UserNames query {
    viewer {
        users {
            pageInfo {
                startCursor
                endCursor
            }
            edges {
                cursor
                node {
                    id
                    firstName
                    lastName
                }
            }
        }
    }
}
~~~

Our goal is to extract and return ONLY `id`, `firstName` and `lastName`
fields from the user data. To achieve that we would need to bypass
required fields information to underlying service or database, for
example, let's assume we want to select that kind of data from mongodb.

In this case we will need to implement a resolver which will fetch only
requested fields from our database like this:

~~~javascript
const { connectionFromArray } from 'graphql-relay';
const { fieldsList } = require('graphql-fields-list');
// ... assuming we implement resolver on 'viewer' node:
async resolve(src, args, context, info) {
    // we want to get a clue which user data fields are requested, so:
    const fields = fieldsList(info, { path: 'users.edges.node' });
    // RESULT: fields = ['id', 'firstName', 'lastName']
    // Now we can fetch from mongodb only required part of the data
    // instead of fetching entire user data document (assuming
    // userDb is initialized model of mongoose):
    const users = await userDb.find().select(fields.join(' ')).exec();
    return { viewer: { users: connectionFromArray(users, args) } };
}
~~~

In the example above we assume our user model in database contains the
same field names as defined by a graphql request. BTW, in a real world,
there could be a need to re-map field names from a graphql query to
some different names stored in a database. For example, we would need
to use automatically created `_id` field in mongodb as `id` field in
a graphql request. This can be easily achieved specifying a `transform`
map option:

~~~javascript
const fields = fieldsList(info, {
    path: 'users.edges.node',
    transform: { id: '_id' },
});
// fields = ['_id', 'firstName', 'lastName']
~~~

By the way, in some particular cases there could be a need to retrieve
a whole fields name hierarchy from a graphql request. This could be
achieved using `fieldsMap` function:

~~~javascript
const { fieldsMap } = require('graphql-fields-list');
// ... inside the resolver as we did above:
const map = fieldsMap(info);
/*
map = {
  users: {
    pageInfo: {
      startCursor: false,
      endCursor: false
    },
    edges: {
      cursor: false,
      node: {
        id: false,
        firstName: false,
        lastName: false
      }
    }
  }
}
*/
~~~

Function `fieldsMap` also accepts `path` optional argument, which allows
to retrieve only a required part of the map:

~~~javascript
const map = fieldsMap(info, 'users.pageInfo');
/*
map = {
  startCursor: false,
  endCursor: false
}
*/
~~~

For leafs of the fields tree it will return `false` value, which is
usable when you need to detect that the end of a tree branch is reached.

Both `fieldsMap` and `fieldsList` works as expected with graphql query
fragmentation, so can be safely used within any possible queries.

## License

[ISC Licence](LICENSE)