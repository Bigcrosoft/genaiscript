import { Project } from "./ast"
import { NotSupportedError } from "./error"
import { isJSONSchema } from "./schema"
import { resolveSystems } from "./systems"
import { logError, normalizeFloat, normalizeInt } from "./util"

export function promptParameterTypeToJSONSchema(
    t: PromptParameterType
):
    | JSONSchemaNumber
    | JSONSchemaString
    | JSONSchemaBoolean
    | JSONSchemaObject
    | JSONSchemaArray {
    if (typeof t === "string")
        return <JSONSchemaString>{ type: "string", default: t }
    else if (typeof t === "number")
        return <JSONSchemaNumber>{ type: "number", default: t }
    else if (typeof t === "boolean")
        return <JSONSchemaBoolean>{ type: "boolean", default: t }
    else if (Array.isArray(t))
        return <JSONSchemaArray>{
            type: "array",
            items: promptParameterTypeToJSONSchema(t[0]),
        }
    else if (
        typeof t === "object" &&
        ["number", "integer", "string", "boolean", "object"].includes(
            (t as any).type
        )
    ) {
        return <
            | JSONSchemaNumber
            | JSONSchemaString
            | JSONSchemaBoolean
            | JSONSchemaObject
        >t
    } else if (typeof t === "object")
        return <JSONSchemaObject>{
            type: "object",
            properties: Object.fromEntries(
                Object.entries(t).map(([k, v]) => [
                    k,
                    promptParameterTypeToJSONSchema(v),
                ])
            ),
        }
    else throw new NotSupportedError(`prompt type ${typeof t} not supported`)
}

export function promptParametersSchemaToJSONSchema(
    parameters: PromptParametersSchema | JSONSchema
) {
    if (!parameters) return undefined
    if (isJSONSchema(parameters)) return parameters as JSONSchema

    const res: JSONSchemaObject = {
        type: "object",
        properties: {},
        required: [],
    }
    for (const [k, v] of Object.entries(parameters)) {
        const t = promptParameterTypeToJSONSchema(v)
        res.properties[k] = t
        if (
            t.type !== "object" &&
            t.type !== "array" &&
            t.default !== undefined &&
            t.default !== null
        )
            res.required.push(k)
    }
    return res
}

export function parsePromptParameters(
    prj: Project,
    script: PromptScript,
    optionsVars: Record<string, string | number | boolean | object>
): PromptParameters {
    const res: PromptParameters = {}

    // create the mega parameter structure
    const parameters: PromptParameters = {
        ...(script.parameters || {}),
    }
    for (const system of resolveSystems(prj, script)
        .map((s) => prj.getTemplate(s))
        .filter((t) => t?.parameters)) {
        Object.entries(system.parameters).forEach(([k, v]) => {
            parameters[`${system.id}.${k}`] = v
        })
    }

    // apply defaults
    for (const key in parameters || {}) {
        const p = parameters[key] as any
        if (p.default !== undefined) res[key] = structuredClone(p.default)
        else {
            const t = promptParameterTypeToJSONSchema(p)
            if (t.default !== undefined) res[key] = structuredClone(t.default)
        }
    }

    const vars = {
        ...(script.vars || {}),
        ...(optionsVars || {}),
    }
    // override with user parameters
    for (const key in vars) {
        const p = parameters[key]
        if (!p) {
            res[key] = vars[key]
            continue
        }

        const t = promptParameterTypeToJSONSchema(p)
        if (t?.type === "number") res[key] = normalizeFloat(vars[key])
        else if (t?.type === "integer") res[key] = normalizeInt(vars[key])
        else if (t?.type === "boolean")
            res[key] = /^\s*(y|yes|true|ok)\s*$/i.test(vars[key] + "")
        else if (t?.type === "string") res[key] = vars[key]
    }

    // clone res to all lower case
    for (const key of Object.keys(res)) {
        const nkey = normalizeVarKey(key)
        if (nkey !== key) {
            if (res[nkey] !== undefined)
                logError(`duplicate parameter ${key} (${nkey})`)
            res[nkey] = res[key]
            delete res[key]
        }
    }
    return Object.freeze(res)
}

export function proxifyVars(res: PromptParameters) {
    const varsProxy: PromptParameters = new Proxy(res, {
        get(target: PromptParameters, prop: string) {
            return prop ? target[normalizeVarKey(prop)] : undefined
        },
        ownKeys(target: PromptParameters) {
            return Reflect.ownKeys(target).map((k) =>
                normalizeVarKey(k as string)
            )
        },
        getOwnPropertyDescriptor(target: PromptParameters, prop: string) {
            const normalizedKey = normalizeVarKey(prop)
            const value = target[normalizedKey]
            if (value !== undefined) {
                return {
                    enumerable: true,
                    configurable: false,
                    writable: false,
                    value,
                }
            }
            return undefined
        },
    })
    return varsProxy
}

function normalizeVarKey(key: string) {
    return key.toLowerCase().replace(/[^a-z0-9\.]/g, "")
}

export function parametersToVars(parameters: PromptParameters): string[] {
    if (!parameters) return undefined
    return Object.keys(parameters).map((k) => `${k}=${parameters[k]}`)
}
