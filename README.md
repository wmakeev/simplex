# SimplEx <!-- omit in toc -->

[![npm](https://img.shields.io/npm/v/simplex-lang.svg?cacheSeconds=1800&style=flat-square)](https://www.npmjs.com/package/simplex-lang)
[![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/wmakeev/simplex/main.yml?style=flat-square)](https://github.com/wmakeev/simplex/actions/workflows/main.yml)
![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/wmakeev/simplex/main/badges/coverage.json)
![no dependencies](https://img.shields.io/badge/dependencies-no-green?style=flat-square)
[![parser](https://img.shields.io/badge/parser-peggy-pink?style=flat-square)](https://peggyjs.org/)

> **SimplEx** - javascript **Simpl**e **Ex**pression language

## Table of contents <!-- omit in toc -->

- [Quick start](#quick-start)
- [Links](#links)

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

## Links

- [AST Explorer](https://astexplorer.net/)
