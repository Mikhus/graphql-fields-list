import * as fs from 'fs';
import * as path from 'path';
import { printSchema } from 'graphql';
import { schema } from '../test/mocks/schema';

const schemaPath = path.resolve(__dirname, '../test/mocks/schema.graphql');

fs.writeFileSync(schemaPath, printSchema(schema));
console.log('Done!');
