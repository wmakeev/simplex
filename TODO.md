# TODO

- [ ] Обновить документацию для оператора `::`

- [ ] Treat NaN like null/undefined in `|?` (optional pipe) and `??` (nullish coalescing) — NaN should short-circuit in `|?` and be replaced by the right operand in `??`

## Maybe

- [ ] (?) Прямой доступ к глобальным переменным - ` #"My var" `, ` #'My "value"' `, ``` #`other${x}` ```

- [ ] (?) Передавать флаг `computed` в `getProperty` — чтобы кастомные реализации могли отличать `obj.foo` (name lookup) от `obj[foo]` (value lookup). Пока нет конкретного use case.
