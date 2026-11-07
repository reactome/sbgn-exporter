/**
 * The diagram layout the conversion reads (spec 001, data-model.md): a pathway's diagram
 * file from the release, or a reaction's layout as the website's content service answers
 * it, parsed from JSON. Both are diagram-reader's model (1.2.5, the version
 * diagram-exporter 2.0.12 reads them with).
 *
 * Only the fields the conversion reads are typed; the others (links, shadows, notes,
 * colours, positions and the rest) are ignored, as Java's reader ignores what it does not
 * know. Each field's type is diagram-reader's (a Java `Long` is a whole number, a
 * `Double` any number), and a field is optional where real files leave it out or Java
 * tests it for null; a `null` is read as an absent field, as Java's reader makes both a
 * null. Anything else that does not fit is refused with an `SbgnLayoutError` naming the
 * object and the field.
 *
 * Reading builds new objects and lists: the layout it was given is never altered, and
 * what it returns holds nothing but the fields typed here.
 */
/** A layout the conversion cannot read or convert; its message names the object. */
export class SbgnLayoutError extends Error {
    name = 'SbgnLayoutError';
}
export const CONNECTOR_TYPES = ['INPUT', 'OUTPUT', 'CATALYST', 'INHIBITOR', 'ACTIVATOR'];
function isLayoutId(value) {
    return Number.isSafeInteger(value);
}
function isReactomeId(value) {
    return Number.isSafeInteger(value);
}
function isOneOf(values, value) {
    return values.some((v) => v === value);
}
/** A Java `Long` that a double holds exactly. */
const WHOLE = 'a whole number within ±2^53';
const JAVA_INT_MIN = -(2 ** 31);
const JAVA_INT_MAX = 2 ** 31 - 1;
/**
 * One JSON object being read: `where` names the object for a message (`node 12
 * (reactomeId 69563, nodes[3])`), and `path` the field's place within it
 * (`connectors[0].stoichiometry`).
 */
class Fields {
    value;
    where;
    path;
    constructor(value, where, path) {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            throw refusal(where, path, value, 'an object');
        }
        this.value = value;
        this.where = where;
        this.path = path;
    }
    /** The name of a field of this object, for a message. */
    name(key) {
        return this.path === '' ? key : `${this.path}.${key}`;
    }
    /** A field's value, or undefined for one absent or null. */
    get(key) {
        const value = Object.hasOwn(this.value, key)
            ? Reflect.get(this.value, key)
            : undefined;
        return value ?? undefined;
    }
    required(key, expected) {
        const value = this.get(key);
        if (value === undefined)
            throw refusal(this.where, this.name(key), value, expected);
        return value;
    }
    refuse(key, expected) {
        throw refusal(this.where, this.name(key), this.get(key), expected);
    }
    object(key) {
        return new Fields(this.required(key, 'an object'), this.where, this.name(key));
    }
    optionalObject(key) {
        return this.get(key) === undefined ? undefined : this.object(key);
    }
    /** A list, each item read by `read` with its own place in the message. */
    list(key, read) {
        const value = this.required(key, 'a list');
        if (!Array.isArray(value))
            return this.refuse(key, 'a list');
        const items = value;
        return items.map((item, i) => read(item, `${this.name(key)}[${String(i)}]`, i));
    }
    optionalList(key, read) {
        return this.get(key) === undefined ? undefined : this.list(key, read);
    }
    string(key) {
        const value = this.required(key, 'text');
        return typeof value === 'string' ? value : this.refuse(key, 'text');
    }
    optionalString(key) {
        return this.get(key) === undefined ? undefined : this.string(key);
    }
    /** A Java `Double`: any finite number. */
    number(key) {
        const value = this.required(key, 'a number');
        return typeof value === 'number' && Number.isFinite(value)
            ? value
            : this.refuse(key, 'a number');
    }
    /** A Java `Integer`. */
    integer(key) {
        const expected = 'a whole number that fits a Java int';
        const value = this.required(key, expected);
        return typeof value === 'number' &&
            Number.isInteger(value) &&
            value >= JAVA_INT_MIN &&
            value <= JAVA_INT_MAX
            ? value
            : this.refuse(key, expected);
    }
    optionalBoolean(key) {
        const value = this.get(key);
        if (value === undefined || typeof value === 'boolean')
            return value;
        return this.refuse(key, 'true or false');
    }
    layoutId(key) {
        const value = this.required(key, WHOLE);
        return typeof value === 'number' && isLayoutId(value) ? value : this.refuse(key, WHOLE);
    }
    reactomeId(key) {
        const value = this.required(key, WHOLE);
        return typeof value === 'number' && isReactomeId(value) ? value : this.refuse(key, WHOLE);
    }
    oneOf(key, values) {
        const expected = `one of ${values.join(', ')}`;
        const value = this.required(key, expected);
        return isOneOf(values, value) ? value : this.refuse(key, expected);
    }
}
/** The longest a value is shown in a message. */
const SHOWN = 80;
/** A value as a message shows it: its JSON, cut short. */
function show(value) {
    if (value === undefined)
        return 'missing';
    let json;
    try {
        json = JSON.stringify(value);
    }
    catch {
        json = undefined;
    }
    if (json === undefined)
        return `a ${typeof value}`;
    return json.length > SHOWN ? `${json.slice(0, SHOWN - 1)}…` : json;
}
function refusal(where, field, value, expected) {
    const shown = show(value);
    const what = field === '' ? where : `${where}: ${field}`;
    return new SbgnLayoutError(`Diagram layout, ${what} is ${shown}; expected ${expected}`);
}
function coordinate(fields) {
    return { x: fields.number('x'), y: fields.number('y') };
}
function nodeProperties(fields) {
    return {
        x: fields.number('x'),
        y: fields.number('y'),
        width: fields.number('width'),
        height: fields.number('height'),
    };
}
function segments(fields, key) {
    return fields.optionalList(key, (item, path) => {
        const segment = new Fields(item, fields.where, path);
        return { from: coordinate(segment.object('from')), to: coordinate(segment.object('to')) };
    });
}
/**
 * Starts reading a diagram object: its own ids first, so that every later refusal names
 * it by them (`node 12 (reactomeId 69563, nodes[3])`), and its index in its list.
 */
function diagramObject(item, kind, path) {
    const id = new Fields(item, 'the diagram', path).layoutId('id');
    const named = new Fields(item, `${kind} ${String(id)} (${path})`, '');
    const reactomeId = named.reactomeId('reactomeId');
    const fields = new Fields(item, `${kind} ${String(id)} (reactomeId ${String(reactomeId)}, ${path})`, '');
    return { fields, object: { id, reactomeId, displayName: fields.string('displayName') } };
}
function compartment(item, path) {
    const { fields, object } = diagramObject(item, 'compartment', path);
    return {
        ...object,
        prop: nodeProperties(fields.object('prop')),
        textPosition: coordinate(fields.object('textPosition')),
    };
}
function nodeAttachment(node, item, path) {
    const fields = new Fields(item, node.where, path);
    const reactomeId = fields.reactomeId('reactomeId');
    const label = fields.optionalString('label');
    const shape = { a: coordinate(fields.object('shape').object('a')) };
    return label === undefined ? { reactomeId, shape } : { reactomeId, label, shape };
}
function stoichiometry(fields) {
    const value = fields.integer('value');
    const box = fields.optionalObject('shape');
    if (box === undefined)
        return { value };
    return { value, shape: { a: coordinate(box.object('a')), b: coordinate(box.object('b')) } };
}
function connector(node, item, path) {
    const fields = new Fields(item, node.where, path);
    const edgeId = fields.layoutId('edgeId');
    const type = fields.oneOf('type', CONNECTOR_TYPES);
    const own = segments(fields, 'segments');
    const count = stoichiometry(fields.object('stoichiometry'));
    return own === undefined
        ? { edgeId, type, stoichiometry: count }
        : { edgeId, type, segments: own, stoichiometry: count };
}
function node(item, path) {
    const { fields, object } = diagramObject(item, 'node', path);
    const renderableClass = fields.string('renderableClass');
    const prop = nodeProperties(fields.object('prop'));
    const isFadeOut = fields.optionalBoolean('isFadeOut');
    const isCrossed = fields.optionalBoolean('isCrossed');
    const nodeAttachments = fields.optionalList('nodeAttachments', (a, p) => nodeAttachment(fields, a, p));
    const connectors = fields.list('connectors', (c, p) => connector(fields, c, p));
    return {
        ...object,
        renderableClass,
        prop,
        ...(isFadeOut === undefined ? {} : { isFadeOut }),
        ...(isCrossed === undefined ? {} : { isCrossed }),
        ...(nodeAttachments === undefined ? {} : { nodeAttachments }),
        connectors,
    };
}
const SHAPE_TYPES = ['BOX', 'CIRCLE', 'DOUBLE_CIRCLE'];
function reactionShape(fields) {
    const type = fields.oneOf('type', SHAPE_TYPES);
    const s = fields.optionalString('s');
    const text = s === undefined ? {} : { s };
    if (type === 'BOX') {
        return { type, a: coordinate(fields.object('a')), b: coordinate(fields.object('b')), ...text };
    }
    return { type, c: coordinate(fields.object('c')), r: fields.number('r'), ...text };
}
function edge(item, path) {
    const { fields, object } = diagramObject(item, 'edge', path);
    const isFadeOut = fields.optionalBoolean('isFadeOut');
    const shape = reactionShape(fields.object('reactionShape'));
    const backbone = segments(fields, 'segments');
    return {
        ...object,
        ...(isFadeOut === undefined ? {} : { isFadeOut }),
        reactionShape: shape,
        ...(backbone === undefined ? {} : { segments: backbone }),
    };
}
/**
 * Reads a parsed diagram layout into its type, refusing a field of the wrong type with
 * an `SbgnLayoutError` that names the object (its kind, `id`, `reactomeId` and place in
 * its list) and the field.
 */
export function readLayout(value) {
    const fields = new Fields(value, 'the diagram', '');
    return {
        stableId: fields.string('stableId'),
        compartments: fields.list('compartments', compartment),
        nodes: fields.list('nodes', node),
        edges: fields.list('edges', edge),
    };
}
