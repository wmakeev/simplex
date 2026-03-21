# TODO

- [x] Экспортировать TypeScript типы для контекстов (глобальный и compile)

- [x] Добавить computed property names - `{ ["foo"]: "bar" }`, `{ [foo]: "bar" }`

- [x] Добавить object spread - `{ ...obj, a: 1 }`

- [x] Добавить array spread - `[1, ...arr, 4]`

- [x] Добавить template literal - ```fn(`My column name ${foo}`)```

- [x] Добавить реализацию по умолчанию для `::`

  ```simplex
  items | map(%, add(#, 10)) | filter(%, gt(#, 15)) // without "::"
  ```

  ```simplex
  items::map(add(#, 10))::filter(gt(#, 15))         // with "::"
  ```

- [ ] Добавить оператор `!` как runtime strict not null assert - `a.b!.c.d!`, `foo!(a)`. Сделать примечание в документации, что в отличии от JS у нас явный optional chaining, но явный not null check (как-бы наизнанку, что практичнее для языка выражений при работе с опциональными структурами данных).

- [x] Добавить tag function - ```$`My column ${ name }` == 42```

- [ ] (?) Прямой доступ к глобальным переменным - ` #"My var" `, ` #'My "value"' `, ``` #`other${x}` ```

- [ ] (?) Передавать флаг `computed` в `getProperty` — чтобы кастомные реализации могли отличать `obj.foo` (name lookup) от `obj[foo]` (value lookup). Пока нет конкретного use case.
