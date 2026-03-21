# TODO

- [ ] Экспортировать TypeScript типы для контекстов (глобальный и compile)

- [x] Добавить computed property names - `{ ["foo"]: "bar" }`, `{ [foo]: "bar" }`

- [x] Добавить object spread - `{ ...obj, a: 1 }`

- [x] Добавить array spread - `[1, ...arr, 4]`

- [x] Добавить template literal - ```fn(`My column name ${foo}`)```

- [ ] Добавить tag function - ```$`My column name` == 42```

- [ ] (?) Прямой доступ к глобальным переменным - ` #"My var" `, ` #'My "value"' `, ``` #`other${x}` ```

- [ ] (?) Передавать флаг `computed` в `getProperty` — чтобы кастомные реализации могли отличать `obj.foo` (name lookup) от `obj[foo]` (value lookup). Пока нет конкретного use case.
