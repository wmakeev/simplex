import { parse } from '../parser/index.js'
import {
  getActiveErrorMapper,
  getExpressionErrorLocation
} from './error-mapping.js'
import type { ErrorMapper } from './error-mapping.js'
import { ExpressionStatement } from './simplex-tree.js'
import { resolveContext } from './runtime.js'
import type { ContextOptions } from './runtime.js'
import { traverse } from './visitors.js'
import type { SourceLocation, VisitResult } from './visitors.js'
import { validate } from './validate.js'
import { GEN, SCOPE_NAMES, SCOPE_VALUES, SCOPE_PARENT } from './constants.js'

export type { SourceLocation, VisitResult, ErrorMapper }
export { traverse, getExpressionErrorLocation }

// Re-export the shared runtime so the public API surface is unchanged.
export type {
  ContextHelpers,
  ExpressionUnaryOperators,
  ExpressionBinaryOperators,
  LogicalOperatorFunction,
  ExpressionLogicalOperators,
  ExpressionOperators
} from './runtime.js'
export {
  createDefaultUnaryOperators,
  defaultUnaryOperators,
  defaultBinaryOperators,
  createDefaultLogicalOperators,
  defaultLogicalOperators,
  resolveContext
} from './runtime.js'

// --- Bootstrap Code ---

const bootstrapCodeHead =
  `
    var ${GEN.bool}=ctx.castToBoolean;
    var ${GEN.str}=ctx.castToString;
    var ${GEN.bop}=ctx.binaryOperators;
    var ${GEN.lop}=ctx.logicalOperators;
    var ${GEN.uop}=ctx.unaryOperators;
    var ${GEN.call}=ctx.callFunction;
    var ${GEN.ensObj}=ctx.ensureObject;
    var ${GEN.ensArr}=ctx.ensureArray;
    var ${GEN.getIdentifierValue}=ctx.getIdentifierValue;
    var ${GEN.prop}=ctx.getProperty;
    var ${GEN.pipe}=ctx.pipe;
    var ${GEN.nna}=ctx.nonNullAssert;
    var ${GEN.globals}=ctx.globals??null;

    function ${GEN._get}(${GEN._scope},name){
      if(${GEN._scope}===null)return ${GEN.getIdentifierValue}(name,${GEN.globals},this);
      var paramIndex=${GEN._scope}[${SCOPE_NAMES}].findIndex(it=>it===name);
      if(paramIndex===-1)return ${GEN._get}.call(this,${GEN._scope}[${SCOPE_PARENT}],name);
      return ${GEN._scope}[${SCOPE_VALUES}][paramIndex]
    };

    return data=>{
      var ${GEN.scope}=null;
      var ${GEN.get}=${GEN._get}.bind(data);
      return
  `
    .split('\n')
    .map(it => it.trim())
    .filter(it => it !== '')
    .join('') + ' '

const bootstrapCodeHeadLen = bootstrapCodeHead.length

// --- Compile ---

export type CompileOptions<Data, Globals> = ContextOptions<Data, Globals> &
  Partial<{ errorMapper: ErrorMapper | null }>

/** Compile a SimplEx expression string into an executable function. */
export function compile<
  Data = Record<string, unknown>,
  Globals = Record<string, unknown>
>(
  expression: string,
  options?: CompileOptions<Data, Globals>
): (data?: Data) => unknown {
  const tree = parse(expression) as ExpressionStatement
  validate(tree, expression)
  const traverseResult = traverse(tree, expression)

  const { code: expressionCode, offsets } = traverseResult

  const functionCode = bootstrapCodeHead + expressionCode + '}'

  const ctx = resolveContext(options)

  const func = new Function('ctx', functionCode)(ctx) as (
    data?: Data
  ) => unknown

  const errorMapper =
    options?.errorMapper !== undefined
      ? options.errorMapper
      : getActiveErrorMapper()

  if (errorMapper === null) return func

  return function (data?: Data) {
    try {
      return func(data)
    } catch (err) {
      throw (
        errorMapper.mapError(err, expression, offsets, bootstrapCodeHeadLen) ??
        err
      )
    }
  }
}
