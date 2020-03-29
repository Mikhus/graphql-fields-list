# graphql-fields-list

[![Build Status](https://travis-ci.org/Mikhus/graphql-fields-list.svg?branch=master)](https://travis-ci.org/Mikhus/graphql-fields-list)
[![codebeat badge](https://codebeat.co/badges/0bdd4ca4-7a15-4c7b-95bd-bbfd52230b50)](https://codebeat.co/projects/github-com-mikhus-graphql-fields-list-master)
[![Coverage Status](https://coveralls.io/repos/github/Mikhus/graphql-fields-list/badge.svg?branch=master)](https://coveralls.io/github/Mikhus/graphql-fields-list?branch=master)
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

## Simplest Usage Examples

For the following query :

~~~graphql
{
  post { # post: [Post]
    id
    author: {
      id
      firstName
      lastName
    }
  }
}
~~~

~~~javascript
resolve(source, args, context, info) { // resolver of Post.author, 
  console.log(fieldsList(info));       // [ 'id', 'firstName', 'lastName' ]
  console.log(fieldsMap(info));        // { id: false, firstName: false, lastName: false }
  console.log(fieldsProjection(info)); // { id: 1, firstName: 1, lastName: 1 };
}

// or, if there is high-level resolver does the work:

resolve(source, args, context, info) { // resolver of Post
  console.log(fieldsList(info));       // [ 'id', 'author' ]
  console.log(fieldsMap(info));        // { id: false, author: { id: false, firstName: false, lastName: false } }
  console.log(fieldsProjection(info)); // { id: 1, 'author.id': 1, 'author.firstName': 1, 'author.lastName': 1 };
}
~~~

## Breaking Changes

Since version 2.0.0 there is breaking change in `fieldsMap()` function interface
now it relies on the same options object as was defined for `fieldsList()` 
instead of bypassing separate arguments. You will need to change your code
if `fieldsMap` being used.

For example, if there was a usage of `path` and `withDirecives` arguments, like:

```typescript
fieldsMap(info, 'users.edges.node', false);
```

it should be changed to:

```typescript
fieldsMap(info, { path: 'users.edges.node', withDirectives: false });
```

## Advanced Usage 

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
// RESULT: fields = ['_id', 'firstName', 'lastName']
~~~

By the way, in some particular cases there could be a need to retrieve
a whole fields name hierarchy from a graphql request. This could be
achieved using `fieldsMap` function:

~~~javascript
const { fieldsMap } = require('graphql-fields-list');
// ... inside the resolver as we did above:
const map = fieldsMap(info);
/*
RESULT:
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

Function `fieldsMap` also accepts same optional arguments as fieldsList:

~~~javascript
const map = fieldsMap(info, { path: 'users.pageInfo' });
/*
RESULT:
map = {
  startCursor: false,
  endCursor: false
}
*/
~~~

For leafs of the fields tree it will return `false` value, which is
usable when you need to detect that the end of a tree branch is reached
during traversal.

Both `fieldsMap` and `fieldsList` work as expected with graphql query
fragmentation, so can be safely used within any possible queries.

Since version 1.1.0 it also supports `@skip` and `@include` directives
in queries. This is enabled by default. If you need to disable
directives support for some reason it may be turned off using
`withDirectives = false` option correspondingly:

~~~javascript
fieldsList(info, { withDirectives: false });
fieldsMap(info, { withDirectives: false });
~~~

>  Please, note, currently `fieldsMap` accepts `transform` option argument, but
>  **DOES NOT USE IT** for transformations. This function will return always the
>  map of the actual query fields. All transformations accepted only by
> `fieldsList` and `fieldsProjection` functions!

**Since version 2.0.0**

In some cases it could be useful to operate with fields projections instead of
mapping object. For example, projection could be used with MongoDB queries.
To extract fields projection object from GraphQLResoleInfo you can utilize
`fieldsProjection()` function:

```javascript
const projection = fieldsProjection(info, { path: 'users.edges.node' });
/*
RESULT:
projection = {
  id: 1,
  firstName: 1,
  lastName: 1,
  phoneNumber: 1,
  email: 1,
  address: 1,
}
*/
```

Projections use dot-notation for a fields and always returned as a flat object:

```javascript
const projection = fieldsProjection(info, { path: 'users.edges' });
/*
RESULT:
projection = {
  'node.id': 1,
  'node.firstName': 1,
  'node.lastName': 1,
  'node.phoneNumber': 1,
  'node.email': 1,
  'node.address': 1,
}
*/
```

Projections also accepts transform option, which should be a mapping object
between projections paths:

```javascript
const projection = fieldsProjection(info, {
    path: 'users.edges',
    transform: {
        'node.id': 'node._id',
        'node.firstName': 'node.given_name',
        'node.lastName': 'node.family_name',
    },
});
/*
RESULT:
projection = {
  'node._id': 1,
  'node.given_name': 1,
  'node.family_name': 1,
  'node.phoneNumber': 1,
  'node.email': 1,
  'node.address': 1,
}
*/
```

**Since version 2.1.0**

It supports `skip` option to filter output of `fieldsList()`, `fieldsMap()` and
`fieldsProjection()` functions.

[See motivation](https://github.com/Mikhus/graphql-fields-list/issues/4)

Skip option accepts an array of field projections to skip. It allows usage
of wildcard symbol `*` within field names. Please, note, that skip occurs
before transformations, so it should reflect original field names, 
transformations would be applied after skip is done.

Typical usage as:

```javascript
const map = fieldsMap(info, { skip: [
    'users.pageInfo.*',
    'users.edges.node.email',
    'users.edges.node.address',
    'users.edges.node.*Name',
]});
/*
RESULT:
map = {
  users: {
    edges: {
      node: {
        id: false,
        phoneNumber: false,
      },
    },
  },
}
*/
const projection = fieldsProjection(info, {
   skip: [
       'users.pageInfo.*',
       'users.edges.node.email',
       'users.edges.node.address',
       'users.edges.node.*Name',
   ],
   transform: {
       'users.edges.node.id': 'users.edges.node._id',
   },
});
/*
RESULT:
projection = {
 'users.edges.node._id': 1,
 'users.edges.node.phoneNumber': 1,
};
*/
```

##  Frequent Questions and Answers

**Q1. Can we exclude `__typename` from fieldsList?**

```typescript
const some = fieldsList(info)
// some output
[ 'id', 'name', '__typename' ]
```

**A1. Usually this problem occurs with using Apollo clients.
Sure, you can overcome this with use of skip option:**

```typescript
const some = fieldsList(info, { skip: ['__*'] })
```
This is exactly the case, why skip option is created for.

## License

[ISC Licence](LICENSE)
