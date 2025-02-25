# SimplEx <!-- omit in toc -->

[![npm](https://img.shields.io/npm/v/simplex-lang.svg?cacheSeconds=1800&style=flat-square)](https://www.npmjs.com/package/simplex-lang)
[![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/wmakeev/simplex/main.yml?style=flat-square)](https://github.com/wmakeev/simplex/actions/workflows/main.yml)
<!-- [![Codecov](https://img.shields.io/codecov/c/github/wmakeev/simplex?style=flat-square)](https://app.codecov.io/gh/wmakeev/simplex/tree/master/) -->
![no dependencies](https://img.shields.io/badge/dependencies-no-green?style=flat-square)
[![parser](https://img.shields.io/badge/parser-peggy-pink?style=flat-square)](https://peggyjs.org/)

> **SimpEx** - javascript **Simpl**e **Ex**pression language

## Table of contents <!-- omit in toc -->

- [Quick start](#quick-start)

## Quick start

```ts
import { compile } from 'simplex-lang'

const fn = compile(`(a + b) * min(a, b) + 10`, {
  globals: {
    min: Math.min
  }
})

const result = fn({ a: 2, b: 3 })

console.log(result)
// ↳ 20
```

<img alt="In the process of development" src="under-construction.png"/>
