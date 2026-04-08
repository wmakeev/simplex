export interface Example {
  id: string
  name: string
  category: string
  expression: string
  globals?: string
  data?: string
  useStdlib?: boolean
}

export const examples: Example[] = [
  // Basics
  {
    id: 'hello',
    name: 'Hello World',
    category: 'Basics',
    expression: '"Hello" & " " & "World!"'
  },
  {
    id: 'arithmetic',
    name: 'Arithmetic',
    category: 'Basics',
    expression: '(2 + 3) * 4 - 1'
  },
  {
    id: 'boolean-logic',
    name: 'Boolean Logic',
    category: 'Basics',
    expression: 'true and not false or false'
  },
  {
    id: 'conditional',
    name: 'Conditional',
    category: 'Basics',
    expression: 'if score >= 90 then "A" else if score >= 80 then "B" else "C"',
    data: '{ "score": 85 }'
  },
  {
    id: 'string-concat',
    name: 'String Concatenation',
    category: 'Basics',
    expression: '"Hello, " & name & "! You are " & age & " years old."',
    data: '{ "name": "Alice", "age": 30 }'
  },

  // Operators
  {
    id: 'nullish',
    name: 'Nullish Coalescing',
    category: 'Operators',
    expression: 'value ?? "default"',
    data: '{ "value": null }'
  },
  {
    id: 'typeof',
    name: 'typeof Operator',
    category: 'Operators',
    expression: '[typeof 42, typeof "hello", typeof true, typeof null]'
  },
  {
    id: 'in-operator',
    name: '"in" Operator',
    category: 'Operators',
    expression: '["name" in user, "age" in user, 0 in items]',
    data: '{ "user": { "name": "Alice" }, "items": [10, 20] }'
  },
  {
    id: 'exponentiation',
    name: 'Exponentiation',
    category: 'Operators',
    expression: '2 ^ 10'
  },

  // Collections
  {
    id: 'arrays',
    name: 'Array Access',
    category: 'Collections',
    expression: 'let arr = [10, 20, 30, 40, 50], arr[2]'
  },
  {
    id: 'objects',
    name: 'Object Literals',
    category: 'Collections',
    expression: '{ name: firstName & " " & lastName, age: age, adult: age >= 18 }',
    data: '{ "firstName": "John", "lastName": "Doe", "age": 25 }'
  },
  {
    id: 'nested-access',
    name: 'Nested Access',
    category: 'Collections',
    expression: 'user.address.city',
    data: '{ "user": { "name": "Alice", "address": { "city": "New York", "zip": "10001" } } }'
  },

  // Pipes
  {
    id: 'pipe-basic',
    name: 'Basic Pipe',
    category: 'Pipes',
    expression: '5 | % + 1 | % * 2'
  },
  {
    id: 'pipe-chain',
    name: 'Pipe Chain',
    category: 'Pipes',
    expression: '10 | % + 5 | % * 2 | % - 1'
  },
  {
    id: 'pipe-optional',
    name: 'Optional Pipe',
    category: 'Pipes',
    expression: 'data |? %.name |? % & "!"',
    data: '{ "data": null }'
  },

  // Lambdas
  {
    id: 'lambda-basic',
    name: 'Basic Lambda',
    category: 'Lambdas',
    expression: 'let add = (a, b) => a + b, add(3, 4)'
  },
  {
    id: 'lambda-higher-order',
    name: 'Higher Order',
    category: 'Lambdas',
    expression: 'let apply = (f, x) => f(x), let double = x => x * 2, apply(double, 21)'
  },
  {
    id: 'lambda-closure',
    name: 'Closure',
    category: 'Lambdas',
    expression: 'let multiplier = n => x => x * n, let triple = multiplier(3), triple(14)'
  },
  {
    id: 'curry',
    name: 'Currying with #',
    category: 'Lambdas',
    expression: 'let add = (a, b) => a + b, let add5 = add(#, 5), add5(10)'
  },

  // Let Expressions
  {
    id: 'let-basic',
    name: 'Basic Let',
    category: 'Let',
    expression: 'let x = 5, y = x + 1, x * y'
  },
  {
    id: 'let-complex',
    name: 'Sequential Bindings',
    category: 'Let',
    expression: 'let a = 1, b = a + 1, c = b + 1, d = c + 1, a + b + c + d'
  },

  // Advanced
  {
    id: 'fibonacci-like',
    name: 'Expression Composition',
    category: 'Advanced',
    expression: 'let fib = n => if n <= 1 then n else fib(n - 1) + fib(n - 2), fib(10)',
  },
  {
    id: 'data-transform',
    name: 'Data Transformation',
    category: 'Advanced',
    expression: '{ total: price * quantity, tax: price * quantity * taxRate, final: price * quantity * (1 + taxRate) }',
    data: '{ "price": 29.99, "quantity": 3, "taxRate": 0.08 }'
  },
  {
    id: 'pipe-all',
    name: 'Pipe Everything',
    category: 'Advanced',
    expression: 'let add = (a, b) => a + b, 1 | add(%, 2) | add(%, 3) | % * 10'
  },

  // Stdlib
  {
    id: 'stdlib-math',
    name: 'Math Functions',
    category: 'Stdlib',
    expression: 'Math.abs(-5) & ", " & Math.round(3.7) & ", " & Math.sqrt(16)',
    useStdlib: true
  },
  {
    id: 'stdlib-strings',
    name: 'String Functions',
    category: 'Stdlib',
    expression: 'Str.toUpperCase("hello") & " " & Str.slice("world", 0, 3)',
    useStdlib: true
  },
  {
    id: 'stdlib-arrays',
    name: 'Array Functions',
    category: 'Stdlib',
    expression: 'Arr.map([1, 2, 3, 4, 5], x => x * x) | Arr.filter(%, x => x > 5) | Arr.sort(%)',
    useStdlib: true
  },
  {
    id: 'stdlib-extensions',
    name: 'Extension Methods',
    category: 'Stdlib',
    expression: '"hello world"::toUpperCase()::split(" ")::join(" - ")',
    useStdlib: true
  },
  {
    id: 'stdlib-utilities',
    name: 'Utility Functions',
    category: 'Stdlib',
    expression: '[empty(null), empty(""), empty([]), exists(0), exists(null), typeOf([1,2])]',
    useStdlib: true
  },
  {
    id: 'stdlib-data-pipeline',
    name: 'Data Pipeline',
    category: 'Stdlib',
    expression: 'items::filter(x => x.price > 20)::map(x => x.name)::sort()::join(", ")',
    data: '{ "items": [{ "name": "Apple", "price": 15 }, { "name": "Banana", "price": 25 }, { "name": "Cherry", "price": 30 }, { "name": "Date", "price": 10 }] }',
    useStdlib: true
  }
]

export function getExampleById(id: string): Example | undefined {
  return examples.find(e => e.id === id)
}

export function getCategories(): string[] {
  return [...new Set(examples.map(e => e.category))]
}
