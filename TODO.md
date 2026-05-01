# TODO

- [x] Treat NaN like null/undefined in `|?` (optional pipe) and `??` (nullish coalescing) — NaN should short-circuit in `|?` and be replaced by the right operand in `??`

- [ ] typeof vs typeOf() - нужно ли два варианта?
  - typeof можно inline - это быстрее, но общий тип для object и NaN для number
  - typeOf() более детальный, что не всегда нужно, но через функцию (медленно)

- [ ] Понятные сообщения об ошибках (что можно с эти сделать)
- [ ] Подчеркивание ошибок в playground
  - [ ] Не отображает диапазон

- [ ] Добавить `::toJson()` для всех serialized сущностей

- [ ] Добавить default parameters в lambda `(a, b = 0) => a + b`

- [ ] Реализовать оператор `->` как `map` и `->>` как `flatMap`

  ```simplex
  // pipe
  [...] | Arr.map( %, it => it.a ) | Arr.flatMap( %, if it < 0 then [] else it )

  // extension
  [...]::map( it => it.a )::flatMap( it => if it < 0 then [] else it )

  // arrow operators
  [...] -> %.a ->> if % < 0 then [] else %
  ```

- [ ] Линтер или запрет на variable shadowing `let empty = () => false, empty([])`?
