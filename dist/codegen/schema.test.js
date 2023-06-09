"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const graphql = __importStar(require("graphql/language"));
const immutable_1 = __importDefault(require("immutable"));
const prettier_1 = __importDefault(require("prettier"));
const schema_1 = __importDefault(require("../schema"));
const schema_2 = __importDefault(require("./schema"));
const typescript_1 = require("./typescript");
const formatTS = (code) => prettier_1.default.format(code, { parser: 'typescript', semi: false });
const createSchemaCodeGen = (schema) => new schema_2.default(new schema_1.default('', schema, immutable_1.default.fromJS(graphql.parse(schema))));
const testEntity = (generatedTypes, expectedEntity) => {
    const entity = generatedTypes.find(type => type.name === expectedEntity.name);
    expect(entity instanceof typescript_1.Class).toBe(true);
    expect(entity.extends).toBe('Entity');
    expect(entity.export).toBe(true);
    const { members, methods } = entity;
    expect(members).toStrictEqual(expectedEntity.members);
    for (const expectedMethod of expectedEntity.methods) {
        const method = methods.find((method) => method.name === expectedMethod.name);
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expectedMethod.static
            ? expect(method instanceof typescript_1.StaticMethod).toBe(true)
            : expect(method instanceof typescript_1.Method).toBe(true);
        expect(method.params).toStrictEqual(expectedMethod.params);
        expect(method.returnType).toStrictEqual(expectedMethod.returnType);
        expect(formatTS(method.body)).toBe(formatTS(expectedMethod.body));
    }
    expect(methods.length).toBe(expectedEntity.methods.length);
};
describe('Schema code generator', () => {
    test('Should generate nothing for non entity types', () => {
        const codegen = createSchemaCodeGen(`
      type Foo {
        foobar: Int
      }

      type Bar {
        barfoo: Int
      }
    `);
        expect(codegen.generateTypes().size).toBe(0);
    });
    describe('Should generate correct classes for each entity', () => {
        const codegen = createSchemaCodeGen(`
      # just to be sure nothing will be generated from non-entity types alongside regular ones
      type Foo {
        foobar: Int
      }

      type Account @entity {
        id: ID!

        # two non primitive types
        description: String
        name: String!

        # two primitive types (i32)
        age: Int
        count: Int!

        # derivedFrom
        wallets: [Wallet!] @derivedFrom(field: "account")
      }

      type Wallet @entity {
        id: ID!
        amount: BigInt!
        account: Account!
      }
    `);
        const generatedTypes = codegen.generateTypes();
        test('Foo is NOT an entity', () => {
            const foo = generatedTypes.find((type) => type.name === 'Foo');
            expect(foo).toBe(undefined);
            // Account and Wallet
            expect(generatedTypes.size).toBe(2);
        });
        test('Account is an entity with the correct methods', () => {
            testEntity(generatedTypes, {
                name: 'Account',
                members: [],
                methods: [
                    {
                        name: 'constructor',
                        params: [new typescript_1.Param('id', new typescript_1.NamedType('string'))],
                        returnType: undefined,
                        body: `
              super()
              this.set('id', Value.fromString(id))
            `,
                    },
                    {
                        name: 'save',
                        params: [],
                        returnType: new typescript_1.NamedType('void'),
                        body: `
              let id = this.get('id')
              assert(id != null, 'Cannot save Account entity without an ID')
              if (id) {
                assert(
                  id.kind == ValueKind.STRING,
                  \`Entities of type Account must have an ID of type String but the id '\${id.displayData()}' is of type \${id.displayKind()}\`)
                store.set('Account', id.toString(), this)
              }
            `,
                    },
                    {
                        name: 'load',
                        static: true,
                        params: [new typescript_1.Param('id', new typescript_1.NamedType('string'))],
                        returnType: new typescript_1.NullableType(new typescript_1.NamedType('Account')),
                        body: `
              return changetype<Account | null>(store.get('Account', id))
            `,
                    },
                    {
                        name: 'get id',
                        params: [],
                        returnType: new typescript_1.NamedType('string'),
                        body: `
              let value = this.get('id')
              return value!.toString()
            `,
                    },
                    {
                        name: 'set id',
                        params: [new typescript_1.Param('value', new typescript_1.NamedType('string'))],
                        returnType: undefined,
                        body: `
              this.set('id', Value.fromString(value))
            `,
                    },
                    {
                        name: 'get description',
                        params: [],
                        returnType: new typescript_1.NullableType(new typescript_1.NamedType('string')),
                        body: `
              let value = this.get('description')
              if (!value || value.kind == ValueKind.NULL) {
                return null
              } else {
                return value.toString()
              }
            `,
                    },
                    {
                        name: 'set description',
                        params: [new typescript_1.Param('value', new typescript_1.NullableType(new typescript_1.NamedType('string')))],
                        returnType: undefined,
                        body: `
              if (!value) {
                this.unset('description')
              } else {
                this.set('description', Value.fromString(<string>value))
              }
            `,
                    },
                    {
                        name: 'get name',
                        params: [],
                        returnType: new typescript_1.NamedType('string'),
                        body: `
              let value = this.get('name')
              return value!.toString()
            `,
                    },
                    {
                        name: 'set name',
                        params: [new typescript_1.Param('value', new typescript_1.NamedType('string'))],
                        returnType: undefined,
                        body: `
              this.set('name', Value.fromString(value))
            `,
                    },
                    {
                        name: 'get age',
                        params: [],
                        returnType: new typescript_1.NamedType('i32'),
                        body: `
              let value = this.get('age')
              return value!.toI32()
            `,
                    },
                    {
                        name: 'set age',
                        params: [new typescript_1.Param('value', new typescript_1.NamedType('i32'))],
                        returnType: undefined,
                        body: `
              this.set('age', Value.fromI32(value))
            `,
                    },
                    {
                        name: 'get count',
                        params: [],
                        returnType: new typescript_1.NamedType('i32'),
                        body: `
              let value = this.get('count')
              return value!.toI32()
            `,
                    },
                    {
                        name: 'set count',
                        params: [new typescript_1.Param('value', new typescript_1.NamedType('i32'))],
                        returnType: undefined,
                        body: `
              this.set('count', Value.fromI32(value))
            `,
                    },
                    {
                        name: 'get wallets',
                        params: [],
                        returnType: new typescript_1.NullableType(new typescript_1.ArrayType(new typescript_1.NamedType('string'))),
                        body: `
              let value = this.get('wallets')
              if (!value || value.kind == ValueKind.NULL) {
                return null
              } else {
                return value.toStringArray()
              }
            `,
                    },
                ],
            });
        });
        test('Wallet is an entity with the correct methods', () => {
            testEntity(generatedTypes, {
                name: 'Wallet',
                members: [],
                methods: [
                    {
                        name: 'constructor',
                        params: [new typescript_1.Param('id', new typescript_1.NamedType('string'))],
                        returnType: undefined,
                        body: `
              super()
              this.set('id', Value.fromString(id))
            `,
                    },
                    {
                        name: 'save',
                        params: [],
                        returnType: new typescript_1.NamedType('void'),
                        body: `
              let id = this.get('id')
              assert(id != null, 'Cannot save Wallet entity without an ID')
              if (id) {
                assert(
                  id.kind == ValueKind.STRING,
                  \`Entities of type Wallet must have an ID of type String but the id '\${id.displayData()}' is of type \${id.displayKind()}\`)
                store.set('Wallet', id.toString(), this)
              }
            `,
                    },
                    {
                        name: 'load',
                        static: true,
                        params: [new typescript_1.Param('id', new typescript_1.NamedType('string'))],
                        returnType: new typescript_1.NullableType(new typescript_1.NamedType('Wallet')),
                        body: `
              return changetype<Wallet | null>(store.get('Wallet', id))
            `,
                    },
                    {
                        name: 'get id',
                        params: [],
                        returnType: new typescript_1.NamedType('string'),
                        body: `
              let value = this.get('id')
              return value!.toString()
            `,
                    },
                    {
                        name: 'set id',
                        params: [new typescript_1.Param('value', new typescript_1.NamedType('string'))],
                        returnType: undefined,
                        body: `
              this.set('id', Value.fromString(value))
            `,
                    },
                    {
                        name: 'get amount',
                        params: [],
                        returnType: new typescript_1.NamedType('BigInt'),
                        body: `
              let value = this.get('amount')
              return value!.toBigInt()
            `,
                    },
                    {
                        name: 'set amount',
                        params: [new typescript_1.Param('value', new typescript_1.NamedType('BigInt'))],
                        returnType: undefined,
                        body: `
              this.set('amount', Value.fromBigInt(value))
            `,
                    },
                    {
                        name: 'get account',
                        params: [],
                        returnType: new typescript_1.NamedType('string'),
                        body: `
              let value = this.get('account')
              return value!.toString()
            `,
                    },
                    {
                        name: 'set account',
                        params: [new typescript_1.Param('value', new typescript_1.NamedType('string'))],
                        returnType: undefined,
                        body: `
              this.set('account', Value.fromString(value))
            `,
                    },
                ],
            });
        });
    });
    test('Should handle references with Bytes id types', () => {
        const codegen = createSchemaCodeGen(`
    interface Employee {
      id: Bytes!
      name: String!
     }

    type Worker implements Employee @entity {
      id: Bytes!
      name: String!
   }

    type Task @entity {
      id: Bytes!
      employee: Employee!
      worker: Worker!
   }
`);
        const generatedTypes = codegen.generateTypes();
        testEntity(generatedTypes, {
            name: 'Task',
            members: [],
            methods: [
                {
                    name: 'constructor',
                    params: [new typescript_1.Param('id', new typescript_1.NamedType('Bytes'))],
                    returnType: undefined,
                    body: "\n      super()\n      this.set('id', Value.fromBytes(id))\n      ",
                },
                {
                    name: 'save',
                    params: [],
                    returnType: new typescript_1.NamedType('void'),
                    body: '\n' +
                        "        let id = this.get('id')\n" +
                        '        assert(id != null,\n' +
                        "               'Cannot save Task entity without an ID')\n" +
                        '        if (id) {\n' +
                        '          assert(id.kind == ValueKind.BYTES,\n' +
                        "                 `Entities of type Task must have an ID of type Bytes but the id '${id.displayData()}' is of type ${id.displayKind()}`)\n" +
                        "          store.set('Task', id.toBytes().toHexString(), this)\n" +
                        '        }',
                },
                {
                    name: 'load',
                    static: true,
                    params: [new typescript_1.Param('id', new typescript_1.NamedType('Bytes'))],
                    returnType: new typescript_1.NullableType(new typescript_1.NamedType('Task')),
                    body: '\n' +
                        "        return changetype<Task | null>(store.get('Task', id.toHexString()))\n" +
                        '        ',
                },
                {
                    name: 'get id',
                    params: [],
                    returnType: new typescript_1.NamedType('Bytes'),
                    body: '\n' +
                        "       let value = this.get('id')\n" +
                        '       return value!.toBytes()\n' +
                        '      ',
                },
                {
                    name: 'set id',
                    params: [new typescript_1.Param('value', new typescript_1.NamedType('Bytes'))],
                    returnType: undefined,
                    body: "\n      this.set('id', Value.fromBytes(value))\n    ",
                },
                {
                    name: 'get employee',
                    params: [],
                    returnType: new typescript_1.NamedType('Bytes'),
                    body: '\n' +
                        "       let value = this.get('employee')\n" +
                        '       return value!.toBytes()\n' +
                        '      ',
                },
                {
                    name: 'set employee',
                    params: [new typescript_1.Param('value', new typescript_1.NamedType('Bytes'))],
                    returnType: undefined,
                    body: "\n      this.set('employee', Value.fromBytes(value))\n    ",
                },
                {
                    name: 'get worker',
                    params: [],
                    returnType: new typescript_1.NamedType('Bytes'),
                    body: '\n' +
                        "       let value = this.get('worker')\n" +
                        '       return value!.toBytes()\n' +
                        '      ',
                },
                {
                    name: 'set worker',
                    params: [new typescript_1.Param('value', new typescript_1.NamedType('Bytes'))],
                    returnType: undefined,
                    body: "\n      this.set('worker', Value.fromBytes(value))\n    ",
                },
            ],
        });
    });
});
