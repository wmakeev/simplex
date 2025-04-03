// eslint-disable-next-line n/no-missing-import
import { parse } from '../parser/index.js'
import assert from 'node:assert/strict'
import { test, suite } from 'node:test'

suite('parser', () => {
  test('null Literal', () => {
    assert.deepEqual(
      parse('null'),
      {
        type: 'ExpressionStatement',
        expression: {
          type: 'Literal',
          value: null,
          location: {
            start: {
              offset: 0,
              line: 1,
              column: 1
            },
            end: {
              offset: 4,
              line: 1,
              column: 5
            }
          }
        }
      },
      'null Literal'
    )
  })

  test('boolean Literal', () => {
    assert.deepEqual(
      parse('true'),
      {
        type: 'ExpressionStatement',
        expression: {
          type: 'Literal',
          value: true,
          location: {
            start: {
              offset: 0,
              line: 1,
              column: 1
            },
            end: {
              offset: 4,
              line: 1,
              column: 5
            }
          }
        }
      },
      'true Literal'
    )

    assert.deepEqual(
      parse('false'),
      {
        type: 'ExpressionStatement',
        expression: {
          type: 'Literal',
          value: false,
          location: {
            start: {
              offset: 0,
              line: 1,
              column: 1
            },
            end: {
              offset: 5,
              line: 1,
              column: 6
            }
          }
        }
      },
      'false Literal'
    )
  })

  test('number Literal', () => {
    assert.deepEqual(parse('2'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'Literal',
        value: 2,
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 1,
            line: 1,
            column: 2
          }
        }
      }
    })

    assert.deepEqual(parse('42'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'Literal',
        value: 42,
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 2,
            line: 1,
            column: 3
          }
        }
      }
    })

    assert.deepEqual(parse('42.'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'Literal',
        value: 42,
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 3,
            line: 1,
            column: 4
          }
        }
      }
    })

    assert.deepEqual(parse('1.23'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'Literal',
        value: 1.23,
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 4,
            line: 1,
            column: 5
          }
        }
      }
    })

    assert.deepEqual(parse('1.00'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'Literal',
        value: 1,
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 4,
            line: 1,
            column: 5
          }
        }
      }
    })

    assert.deepEqual(parse('1.21e1'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'Literal',
        value: 12.1,
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 6,
            line: 1,
            column: 7
          }
        }
      }
    })

    assert.deepEqual(parse('12345e-2'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'Literal',
        value: 123.45,
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 8,
            line: 1,
            column: 9
          }
        }
      }
    })

    assert.throws(() => {
      parse('02')
    }, /Expected/)

    assert.deepEqual(parse('0xA'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'Literal',
        value: 10,
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 3,
            line: 1,
            column: 4
          }
        }
      }
    })
  })

  test('string Literal', () => {
    assert.deepEqual(parse("''"), {
      type: 'ExpressionStatement',
      expression: {
        type: 'Literal',
        value: '',
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 2,
            line: 1,
            column: 3
          }
        }
      }
    })

    assert.deepEqual(parse('""'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'Literal',
        value: '',
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 2,
            line: 1,
            column: 3
          }
        }
      }
    })

    assert.deepEqual(parse("'abc123'"), {
      type: 'ExpressionStatement',
      expression: {
        type: 'Literal',
        value: 'abc123',
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 8,
            line: 1,
            column: 9
          }
        }
      }
    })

    assert.deepEqual(parse('"123 \\\n456\\\n789"'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'Literal',
        value: '123 456789',
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 16,
            line: 3,
            column: 5
          }
        }
      }
    })

    const tree: unknown = parse("'abc😉123\u00A0456\t7'")
    assert.deepEqual(
      tree,
      {
        type: 'ExpressionStatement',
        expression: {
          type: 'Literal',
          value: 'abc😉123 456\t7',
          location: {
            start: {
              offset: 0,
              line: 1,
              column: 1
            },
            end: {
              offset: 16,
              line: 1,
              column: 17
            }
          }
        }
      },
      'empty string Literal'
    )
  })

  test('string Literal with spaces', () => {
    const tree: unknown = parse('\t \v\f \u00A0\u1680\uFEFF2 ')

    assert.deepEqual(tree, {
      type: 'ExpressionStatement',
      expression: {
        type: 'Literal',
        value: 2,
        location: {
          start: {
            offset: 8,
            line: 1,
            column: 9
          },
          end: {
            offset: 9,
            line: 1,
            column: 10
          }
        }
      }
    })
  })

  test('Identifier', () => {
    assert.deepEqual(parse('a'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'Identifier',
        name: 'a',
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 1,
            line: 1,
            column: 2
          }
        }
      }
    })

    assert.deepEqual(parse('abc'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'Identifier',
        name: 'abc',
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 3,
            line: 1,
            column: 4
          }
        }
      }
    })

    assert.throws(
      () => {
        parse('123abc')
      },
      /Expected/,
      'incorrect Identifier'
    )
  })

  test('UnaryExpression', () => {
    assert.deepEqual(parse('-42'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'UnaryExpression',
        operator: '-',
        argument: {
          type: 'Literal',
          value: 42,
          location: {
            start: {
              offset: 1,
              line: 1,
              column: 2
            },
            end: {
              offset: 3,
              line: 1,
              column: 4
            }
          }
        },
        prefix: true,
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 3,
            line: 1,
            column: 4
          }
        }
      }
    })

    assert.deepEqual(parse('+42'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'UnaryExpression',
        operator: '+',
        argument: {
          type: 'Literal',
          value: 42,
          location: {
            start: {
              offset: 1,
              line: 1,
              column: 2
            },
            end: {
              offset: 3,
              line: 1,
              column: 4
            }
          }
        },
        prefix: true,
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 3,
            line: 1,
            column: 4
          }
        }
      }
    })

    assert.deepEqual(parse('typeof a'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'UnaryExpression',
        operator: 'typeof',
        argument: {
          type: 'Identifier',
          name: 'a',
          location: {
            start: {
              offset: 7,
              line: 1,
              column: 8
            },
            end: {
              offset: 8,
              line: 1,
              column: 9
            }
          }
        },
        prefix: true,
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 8,
            line: 1,
            column: 9
          }
        }
      }
    })
  })

  test('BinaryExpression', () => {
    const operators = ['^', '*', '+', '&', '==', '!=', '<', '<=', '>', '>=']

    for (const operator of operators) {
      const shift = operator.length - 1
      const expression: unknown = parse(`a${operator}b`)

      assert.deepEqual(
        expression,
        {
          type: 'ExpressionStatement',
          expression: {
            type: 'BinaryExpression',
            operator: operator,
            left: {
              type: 'Identifier',
              name: 'a',
              location: {
                start: {
                  offset: 0,
                  line: 1,
                  column: 1
                },
                end: {
                  offset: 1,
                  line: 1,
                  column: 2
                }
              }
            },
            right: {
              type: 'Identifier',
              name: 'b',
              location: {
                start: {
                  offset: 2 + shift,
                  line: 1,
                  column: 3 + shift
                },
                end: {
                  offset: 3 + shift,
                  line: 1,
                  column: 4 + shift
                }
              }
            },
            location: {
              start: {
                offset: 0,
                line: 1,
                column: 1
              },
              end: {
                offset: 3 + shift,
                line: 1,
                column: 4 + shift
              }
            }
          }
        },
        `${operator} operator expression`
      )
    }
  })

  test('LogicalExpression', () => {
    const tree: unknown = parse('true and false')
    assert.deepEqual(tree, {
      type: 'ExpressionStatement',
      expression: {
        type: 'LogicalExpression',
        operator: 'and',
        left: {
          type: 'Literal',
          value: true,
          location: {
            start: {
              offset: 0,
              line: 1,
              column: 1
            },
            end: {
              offset: 4,
              line: 1,
              column: 5
            }
          }
        },
        right: {
          type: 'Literal',
          value: false,
          location: {
            start: {
              offset: 9,
              line: 1,
              column: 10
            },
            end: {
              offset: 14,
              line: 1,
              column: 15
            }
          }
        },
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 14,
            line: 1,
            column: 15
          }
        }
      }
    })

    assert.deepEqual(parse('true or false'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'LogicalExpression',
        operator: 'or',
        left: {
          type: 'Literal',
          value: true,
          location: {
            start: {
              offset: 0,
              line: 1,
              column: 1
            },
            end: {
              offset: 4,
              line: 1,
              column: 5
            }
          }
        },
        right: {
          type: 'Literal',
          value: false,
          location: {
            start: {
              offset: 8,
              line: 1,
              column: 9
            },
            end: {
              offset: 13,
              line: 1,
              column: 14
            }
          }
        },
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 13,
            line: 1,
            column: 14
          }
        }
      }
    })
  })

  test('ConditionalExpression', () => {
    assert.deepEqual(parse('if true then 42'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'ConditionalExpression',
        test: {
          type: 'Literal',
          value: true,
          location: {
            start: {
              offset: 3,
              line: 1,
              column: 4
            },
            end: {
              offset: 7,
              line: 1,
              column: 8
            }
          }
        },
        consequent: {
          type: 'Literal',
          value: 42,
          location: {
            start: {
              offset: 13,
              line: 1,
              column: 14
            },
            end: {
              offset: 15,
              line: 1,
              column: 16
            }
          }
        },
        alternate: null,
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 15,
            line: 1,
            column: 16
          }
        }
      }
    })

    assert.deepEqual(
      parse('if true then 42 else null'),
      {
        type: 'ExpressionStatement',
        expression: {
          type: 'ConditionalExpression',
          test: {
            type: 'Literal',
            value: true,
            location: {
              start: {
                offset: 3,
                line: 1,
                column: 4
              },
              end: {
                offset: 7,
                line: 1,
                column: 8
              }
            }
          },
          consequent: {
            type: 'Literal',
            value: 42,
            location: {
              start: {
                offset: 13,
                line: 1,
                column: 14
              },
              end: {
                offset: 15,
                line: 1,
                column: 16
              }
            }
          },
          alternate: {
            type: 'Literal',
            value: null,
            location: {
              start: {
                offset: 21,
                line: 1,
                column: 22
              },
              end: {
                offset: 25,
                line: 1,
                column: 26
              }
            }
          },
          location: {
            start: {
              offset: 0,
              line: 1,
              column: 1
            },
            end: {
              offset: 25,
              line: 1,
              column: 26
            }
          }
        }
      },
      'ConditionalExpression with else'
    )
  })

  test('ObjectExpression', () => {
    assert.deepEqual(parse('{}'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'ObjectExpression',
        properties: [],
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 2,
            line: 1,
            column: 3
          }
        }
      }
    })

    assert.deepEqual(parse('{ a: 1 }'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'ObjectExpression',
        properties: [
          {
            type: 'Property',
            key: {
              type: 'Identifier',
              name: 'a',
              location: {
                start: {
                  offset: 2,
                  line: 1,
                  column: 3
                },
                end: {
                  offset: 3,
                  line: 1,
                  column: 4
                }
              }
            },
            value: {
              type: 'Literal',
              value: 1,
              location: {
                start: {
                  offset: 5,
                  line: 1,
                  column: 6
                },
                end: {
                  offset: 6,
                  line: 1,
                  column: 7
                }
              }
            },
            kind: 'init',
            location: {
              start: {
                offset: 2,
                line: 1,
                column: 3
              },
              end: {
                offset: 6,
                line: 1,
                column: 7
              }
            }
          }
        ],
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 8,
            line: 1,
            column: 9
          }
        }
      }
    })
  })

  test('ArrayExpression', () => {
    assert.deepEqual(parse('[]'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'ArrayExpression',
        elements: [],
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 2,
            line: 1,
            column: 3
          }
        }
      }
    })

    assert.deepEqual(parse('[1, 2, , a]'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'ArrayExpression',
        elements: [
          {
            type: 'Literal',
            value: 1,
            location: {
              start: {
                offset: 1,
                line: 1,
                column: 2
              },
              end: {
                offset: 2,
                line: 1,
                column: 3
              }
            }
          },
          {
            type: 'Literal',
            value: 2,
            location: {
              start: {
                offset: 4,
                line: 1,
                column: 5
              },
              end: {
                offset: 5,
                line: 1,
                column: 6
              }
            }
          },
          null,
          {
            type: 'Identifier',
            name: 'a',
            location: {
              start: {
                offset: 9,
                line: 1,
                column: 10
              },
              end: {
                offset: 10,
                line: 1,
                column: 11
              }
            }
          }
        ],
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 11,
            line: 1,
            column: 12
          }
        }
      }
    })
  })

  test('MemberExpression', () => {
    assert.deepEqual(parse('a.b'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'MemberExpression',
        object: {
          type: 'Identifier',
          name: 'a',
          location: {
            start: {
              offset: 0,
              line: 1,
              column: 1
            },
            end: {
              offset: 1,
              line: 1,
              column: 2
            }
          }
        },
        property: {
          type: 'Identifier',
          name: 'b',
          location: {
            start: {
              offset: 2,
              line: 1,
              column: 3
            },
            end: {
              offset: 3,
              line: 1,
              column: 4
            }
          }
        },
        computed: false,
        extension: false,
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 3,
            line: 1,
            column: 4
          }
        }
      }
    })

    assert.deepEqual(parse('a::b'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'MemberExpression',
        object: {
          type: 'Identifier',
          name: 'a',
          location: {
            start: {
              offset: 0,
              line: 1,
              column: 1
            },
            end: {
              offset: 1,
              line: 1,
              column: 2
            }
          }
        },
        property: {
          type: 'Identifier',
          name: 'b',
          location: {
            start: {
              offset: 3,
              line: 1,
              column: 4
            },
            end: {
              offset: 4,
              line: 1,
              column: 5
            }
          }
        },
        computed: false,
        extension: true,
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 4,
            line: 1,
            column: 5
          }
        }
      }
    })

    assert.deepEqual(parse('a["foo"]'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'MemberExpression',
        object: {
          type: 'Identifier',
          name: 'a',
          location: {
            start: {
              offset: 0,
              line: 1,
              column: 1
            },
            end: {
              offset: 1,
              line: 1,
              column: 2
            }
          }
        },
        property: {
          type: 'Literal',
          value: 'foo',
          location: {
            start: {
              offset: 2,
              line: 1,
              column: 3
            },
            end: {
              offset: 7,
              line: 1,
              column: 8
            }
          }
        },
        computed: true,
        extension: false,
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 8,
            line: 1,
            column: 9
          }
        }
      }
    })
  })

  test('CallExpression', () => {
    assert.deepEqual(parse('a()'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'CallExpression',
        callee: {
          type: 'Identifier',
          name: 'a',
          location: {
            start: {
              offset: 0,
              line: 1,
              column: 1
            },
            end: {
              offset: 1,
              line: 1,
              column: 2
            }
          }
        },
        arguments: [],
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 3,
            line: 1,
            column: 4
          }
        }
      }
    })

    assert.deepEqual(parse('a.b()'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'CallExpression',
        callee: {
          type: 'MemberExpression',
          object: {
            type: 'Identifier',
            name: 'a',
            location: {
              start: {
                offset: 0,
                line: 1,
                column: 1
              },
              end: {
                offset: 1,
                line: 1,
                column: 2
              }
            }
          },
          property: {
            type: 'Identifier',
            name: 'b',
            location: {
              start: {
                offset: 2,
                line: 1,
                column: 3
              },
              end: {
                offset: 3,
                line: 1,
                column: 4
              }
            }
          },
          computed: false,
          extension: false,
          location: {
            start: {
              offset: 0,
              line: 1,
              column: 1
            },
            end: {
              offset: 3,
              line: 1,
              column: 4
            }
          }
        },
        arguments: [],
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 5,
            line: 1,
            column: 6
          }
        }
      }
    })

    assert.deepEqual(parse('a::b()'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'CallExpression',
        callee: {
          type: 'MemberExpression',
          object: {
            type: 'Identifier',
            name: 'a',
            location: {
              start: {
                offset: 0,
                line: 1,
                column: 1
              },
              end: {
                offset: 1,
                line: 1,
                column: 2
              }
            }
          },
          property: {
            type: 'Identifier',
            name: 'b',
            location: {
              start: {
                offset: 3,
                line: 1,
                column: 4
              },
              end: {
                offset: 4,
                line: 1,
                column: 5
              }
            }
          },
          computed: false,
          extension: true,
          location: {
            start: {
              offset: 0,
              line: 1,
              column: 1
            },
            end: {
              offset: 4,
              line: 1,
              column: 5
            }
          }
        },
        arguments: [],
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 6,
            line: 1,
            column: 7
          }
        }
      }
    })

    assert.deepEqual(parse('a["b"]()'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'CallExpression',
        callee: {
          type: 'MemberExpression',
          object: {
            type: 'Identifier',
            name: 'a',
            location: {
              start: {
                offset: 0,
                line: 1,
                column: 1
              },
              end: {
                offset: 1,
                line: 1,
                column: 2
              }
            }
          },
          property: {
            type: 'Literal',
            value: 'b',
            location: {
              start: {
                offset: 2,
                line: 1,
                column: 3
              },
              end: {
                offset: 5,
                line: 1,
                column: 6
              }
            }
          },
          computed: true,
          extension: false,
          location: {
            start: {
              offset: 0,
              line: 1,
              column: 1
            },
            end: {
              offset: 6,
              line: 1,
              column: 7
            }
          }
        },
        arguments: [],
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 8,
            line: 1,
            column: 9
          }
        }
      }
    })

    assert.deepEqual(parse('a(1, 2)'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'CallExpression',
        callee: {
          type: 'Identifier',
          name: 'a',
          location: {
            start: {
              offset: 0,
              line: 1,
              column: 1
            },
            end: {
              offset: 1,
              line: 1,
              column: 2
            }
          }
        },
        arguments: [
          {
            type: 'Literal',
            value: 1,
            location: {
              start: {
                offset: 2,
                line: 1,
                column: 3
              },
              end: {
                offset: 3,
                line: 1,
                column: 4
              }
            }
          },
          {
            type: 'Literal',
            value: 2,
            location: {
              start: {
                offset: 5,
                line: 1,
                column: 6
              },
              end: {
                offset: 6,
                line: 1,
                column: 7
              }
            }
          }
        ],
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 7,
            line: 1,
            column: 8
          }
        }
      }
    })
  })

  test('NullishCoalescingExpression', () => {
    assert.deepEqual(parse('a ?? b'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'NullishCoalescingExpression',
        operator: '??',
        left: {
          type: 'Identifier',
          name: 'a',
          location: {
            start: {
              offset: 0,
              line: 1,
              column: 1
            },
            end: {
              offset: 1,
              line: 1,
              column: 2
            }
          }
        },
        right: {
          type: 'Identifier',
          name: 'b',
          location: {
            start: {
              offset: 5,
              line: 1,
              column: 6
            },
            end: {
              offset: 6,
              line: 1,
              column: 7
            }
          }
        },
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 6,
            line: 1,
            column: 7
          }
        }
      }
    })
  })

  test('PipeExpression', () => {
    assert.deepEqual(parse('a | b'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'PipeSequence',
        head: {
          type: 'Identifier',
          name: 'a',
          location: {
            start: {
              offset: 0,
              line: 1,
              column: 1
            },
            end: {
              offset: 1,
              line: 1,
              column: 2
            }
          }
        },
        tail: [
          {
            operator: '|',
            expression: {
              type: 'Identifier',
              name: 'b',
              location: {
                start: {
                  offset: 4,
                  line: 1,
                  column: 5
                },
                end: {
                  offset: 5,
                  line: 1,
                  column: 6
                }
              }
            }
          }
        ],
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 5,
            line: 1,
            column: 6
          }
        }
      }
    })

    assert.deepEqual(parse('a | b | c'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'PipeSequence',
        head: {
          type: 'Identifier',
          name: 'a',
          location: {
            start: {
              offset: 0,
              line: 1,
              column: 1
            },
            end: {
              offset: 1,
              line: 1,
              column: 2
            }
          }
        },
        tail: [
          {
            operator: '|',
            expression: {
              type: 'Identifier',
              name: 'b',
              location: {
                start: {
                  offset: 4,
                  line: 1,
                  column: 5
                },
                end: {
                  offset: 5,
                  line: 1,
                  column: 6
                }
              }
            }
          },
          {
            operator: '|',
            expression: {
              type: 'Identifier',
              name: 'c',
              location: {
                start: {
                  offset: 8,
                  line: 1,
                  column: 9
                },
                end: {
                  offset: 9,
                  line: 1,
                  column: 10
                }
              }
            }
          }
        ],
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 9,
            line: 1,
            column: 10
          }
        }
      }
    })

    assert.deepEqual(parse('null |? add2(_) | a * _'), {
      type: 'ExpressionStatement',
      expression: {
        type: 'PipeSequence',
        head: {
          type: 'Literal',
          value: null,
          location: {
            start: {
              offset: 0,
              line: 1,
              column: 1
            },
            end: {
              offset: 4,
              line: 1,
              column: 5
            }
          }
        },
        tail: [
          {
            operator: '|?',
            expression: {
              type: 'CallExpression',
              callee: {
                type: 'Identifier',
                name: 'add2',
                location: {
                  start: {
                    offset: 8,
                    line: 1,
                    column: 9
                  },
                  end: {
                    offset: 12,
                    line: 1,
                    column: 13
                  }
                }
              },
              arguments: [
                {
                  type: 'Identifier',
                  name: '_',
                  location: {
                    start: {
                      offset: 13,
                      line: 1,
                      column: 14
                    },
                    end: {
                      offset: 14,
                      line: 1,
                      column: 15
                    }
                  }
                }
              ],
              location: {
                start: {
                  offset: 8,
                  line: 1,
                  column: 9
                },
                end: {
                  offset: 15,
                  line: 1,
                  column: 16
                }
              }
            }
          },
          {
            operator: '|',
            expression: {
              type: 'BinaryExpression',
              operator: '*',
              left: {
                type: 'Identifier',
                name: 'a',
                location: {
                  start: {
                    offset: 18,
                    line: 1,
                    column: 19
                  },
                  end: {
                    offset: 19,
                    line: 1,
                    column: 20
                  }
                }
              },
              right: {
                type: 'Identifier',
                name: '_',
                location: {
                  start: {
                    offset: 22,
                    line: 1,
                    column: 23
                  },
                  end: {
                    offset: 23,
                    line: 1,
                    column: 24
                  }
                }
              },
              location: {
                start: {
                  offset: 18,
                  line: 1,
                  column: 19
                },
                end: {
                  offset: 23,
                  line: 1,
                  column: 24
                }
              }
            }
          }
        ],
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 23,
            line: 1,
            column: 24
          }
        }
      }
    })
  })

  test('SingleLineComment and MultiLineComment', () => {
    const expression = `if
	// test for some condition
	val - 1 > 5
then
	/* result is 42 */
	42
else
	/*
      else null
      nothing
    */
	null`

    assert.deepEqual(parse(expression), {
      type: 'ExpressionStatement',
      expression: {
        type: 'ConditionalExpression',
        test: {
          type: 'BinaryExpression',
          operator: '>',
          left: {
            type: 'BinaryExpression',
            operator: '-',
            left: {
              type: 'Identifier',
              name: 'val',
              location: {
                start: {
                  offset: 32,
                  line: 3,
                  column: 2
                },
                end: {
                  offset: 35,
                  line: 3,
                  column: 5
                }
              }
            },
            right: {
              type: 'Literal',
              value: 1,
              location: {
                start: {
                  offset: 38,
                  line: 3,
                  column: 8
                },
                end: {
                  offset: 39,
                  line: 3,
                  column: 9
                }
              }
            },
            location: {
              start: {
                offset: 32,
                line: 3,
                column: 2
              },
              end: {
                offset: 39,
                line: 3,
                column: 9
              }
            }
          },
          right: {
            type: 'Literal',
            value: 5,
            location: {
              start: {
                offset: 42,
                line: 3,
                column: 12
              },
              end: {
                offset: 43,
                line: 3,
                column: 13
              }
            }
          },
          location: {
            start: {
              offset: 32,
              line: 3,
              column: 2
            },
            end: {
              offset: 43,
              line: 3,
              column: 13
            }
          }
        },
        consequent: {
          type: 'Literal',
          value: 42,
          location: {
            start: {
              offset: 70,
              line: 6,
              column: 2
            },
            end: {
              offset: 72,
              line: 6,
              column: 4
            }
          }
        },
        alternate: {
          type: 'Literal',
          value: null,
          location: {
            start: {
              offset: 120,
              line: 12,
              column: 2
            },
            end: {
              offset: 124,
              line: 12,
              column: 6
            }
          }
        },
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 124,
            line: 12,
            column: 6
          }
        }
      }
    })
  })

  test('LambdaExpression', () => {
    const expr1: unknown = parse('a => b')
    assert.deepEqual(expr1, {
      type: 'ExpressionStatement',
      expression: {
        type: 'LambdaExpression',
        params: [
          {
            type: 'Identifier',
            name: 'a',
            location: {
              start: {
                offset: 0,
                line: 1,
                column: 1
              },
              end: {
                offset: 1,
                line: 1,
                column: 2
              }
            }
          }
        ],
        expression: {
          type: 'Identifier',
          name: 'b',
          location: {
            start: {
              offset: 5,
              line: 1,
              column: 6
            },
            end: {
              offset: 6,
              line: 1,
              column: 7
            }
          }
        },
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 6,
            line: 1,
            column: 7
          }
        }
      }
    })

    const expr2: unknown = parse('a => b => c')
    assert.deepEqual(expr2, {
      type: 'ExpressionStatement',
      expression: {
        type: 'LambdaExpression',
        params: [
          {
            type: 'Identifier',
            name: 'a',
            location: {
              start: {
                offset: 0,
                line: 1,
                column: 1
              },
              end: {
                offset: 1,
                line: 1,
                column: 2
              }
            }
          }
        ],
        expression: {
          type: 'LambdaExpression',
          params: [
            {
              type: 'Identifier',
              name: 'b',
              location: {
                start: {
                  offset: 5,
                  line: 1,
                  column: 6
                },
                end: {
                  offset: 6,
                  line: 1,
                  column: 7
                }
              }
            }
          ],
          expression: {
            type: 'Identifier',
            name: 'c',
            location: {
              start: {
                offset: 10,
                line: 1,
                column: 11
              },
              end: {
                offset: 11,
                line: 1,
                column: 12
              }
            }
          },
          location: {
            start: {
              offset: 5,
              line: 1,
              column: 6
            },
            end: {
              offset: 11,
              line: 1,
              column: 12
            }
          }
        },
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 11,
            line: 1,
            column: 12
          }
        }
      }
    })

    const expr3: unknown = parse('(a) => (b) => (c)')
    assert.deepEqual(expr3, {
      type: 'ExpressionStatement',
      expression: {
        type: 'LambdaExpression',
        params: [
          {
            type: 'Identifier',
            name: 'a',
            location: {
              start: {
                offset: 1,
                line: 1,
                column: 2
              },
              end: {
                offset: 2,
                line: 1,
                column: 3
              }
            }
          }
        ],
        expression: {
          type: 'LambdaExpression',
          params: [
            {
              type: 'Identifier',
              name: 'b',
              location: {
                start: {
                  offset: 8,
                  line: 1,
                  column: 9
                },
                end: {
                  offset: 9,
                  line: 1,
                  column: 10
                }
              }
            }
          ],
          expression: {
            type: 'Identifier',
            name: 'c',
            location: {
              start: {
                offset: 15,
                line: 1,
                column: 16
              },
              end: {
                offset: 16,
                line: 1,
                column: 17
              }
            }
          },
          location: {
            start: {
              offset: 7,
              line: 1,
              column: 8
            },
            end: {
              offset: 17,
              line: 1,
              column: 18
            }
          }
        },
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 17,
            line: 1,
            column: 18
          }
        }
      }
    })
  })

  test('LetExpression', () => {
    const expr1: unknown = parse('let a = 1, a')
    assert.deepEqual(expr1, {
      type: 'ExpressionStatement',
      expression: {
        type: 'LetExpression',
        declarations: [
          {
            type: 'VariableDeclarator',
            id: {
              type: 'Identifier',
              name: 'a',
              location: {
                start: {
                  offset: 4,
                  line: 1,
                  column: 5
                },
                end: {
                  offset: 5,
                  line: 1,
                  column: 6
                }
              }
            },
            init: {
              type: 'Literal',
              value: 1,
              location: {
                start: {
                  offset: 8,
                  line: 1,
                  column: 9
                },
                end: {
                  offset: 9,
                  line: 1,
                  column: 10
                }
              }
            },
            location: {
              start: {
                offset: 4,
                line: 1,
                column: 5
              },
              end: {
                offset: 9,
                line: 1,
                column: 10
              }
            }
          }
        ],
        expression: {
          type: 'Identifier',
          name: 'a',
          location: {
            start: {
              offset: 11,
              line: 1,
              column: 12
            },
            end: {
              offset: 12,
              line: 1,
              column: 13
            }
          }
        },
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 12,
            line: 1,
            column: 13
          }
        }
      }
    })

    const expr2: unknown = parse('let a = 1, b = a, a + b')
    assert.deepEqual(expr2, {
      type: 'ExpressionStatement',
      expression: {
        type: 'LetExpression',
        declarations: [
          {
            type: 'VariableDeclarator',
            id: {
              type: 'Identifier',
              name: 'a',
              location: {
                start: {
                  offset: 4,
                  line: 1,
                  column: 5
                },
                end: {
                  offset: 5,
                  line: 1,
                  column: 6
                }
              }
            },
            init: {
              type: 'Literal',
              value: 1,
              location: {
                start: {
                  offset: 8,
                  line: 1,
                  column: 9
                },
                end: {
                  offset: 9,
                  line: 1,
                  column: 10
                }
              }
            },
            location: {
              start: {
                offset: 4,
                line: 1,
                column: 5
              },
              end: {
                offset: 9,
                line: 1,
                column: 10
              }
            }
          },
          {
            type: 'VariableDeclarator',
            id: {
              type: 'Identifier',
              name: 'b',
              location: {
                start: {
                  offset: 11,
                  line: 1,
                  column: 12
                },
                end: {
                  offset: 12,
                  line: 1,
                  column: 13
                }
              }
            },
            init: {
              type: 'Identifier',
              name: 'a',
              location: {
                start: {
                  offset: 15,
                  line: 1,
                  column: 16
                },
                end: {
                  offset: 16,
                  line: 1,
                  column: 17
                }
              }
            },
            location: {
              start: {
                offset: 11,
                line: 1,
                column: 12
              },
              end: {
                offset: 16,
                line: 1,
                column: 17
              }
            }
          }
        ],
        expression: {
          type: 'BinaryExpression',
          operator: '+',
          left: {
            type: 'Identifier',
            name: 'a',
            location: {
              start: {
                offset: 18,
                line: 1,
                column: 19
              },
              end: {
                offset: 19,
                line: 1,
                column: 20
              }
            }
          },
          right: {
            type: 'Identifier',
            name: 'b',
            location: {
              start: {
                offset: 22,
                line: 1,
                column: 23
              },
              end: {
                offset: 23,
                line: 1,
                column: 24
              }
            }
          },
          location: {
            start: {
              offset: 18,
              line: 1,
              column: 19
            },
            end: {
              offset: 23,
              line: 1,
              column: 24
            }
          }
        },
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 23,
            line: 1,
            column: 24
          }
        }
      }
    })
  })
})
