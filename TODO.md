# TODO

- [x] Treat NaN like null/undefined in `|?` (optional pipe) and `??` (nullish coalescing) — NaN should short-circuit in `|?` and be replaced by the right operand in `??`

- [ ] typeof vs typeOf() - нужно ли два варианта?
  - typeof можно inline - это быстрее, но общий тип для object и NaN для number
  - typeOf() более детальный, что не всегда нужно, но через функцию (медленно)
