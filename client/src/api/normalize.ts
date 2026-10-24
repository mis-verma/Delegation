export class Field<T = unknown> {
  run: (value: unknown) => T;

  constructor(run: (value: unknown) => T) {
    this.run = run;
  }

  optional(): Field<T | undefined> {
    return new Field((value) => (value === undefined ? undefined : this.run(value)));
  }

  nullable(): Field<T | null> {
    return new Field((value) => (value === null ? null : this.run(value)));
  }

  catch<F>(fallback: F): Field<T | F> {
    return new Field((value) => {
      try {
        return this.run(value);
      } catch {
        return fallback;
      }
    });
  }

  passthrough(): Field<T> {
    return this;
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const n = {
  string: () =>
    new Field<string>((value) => {
      if (typeof value !== 'string') throw new TypeError('Expected a string');
      return value;
    }),
  unknown: () => new Field<unknown>((value) => value),
  array: <T>(item: Field<T>) =>
    new Field<T[]>((value) => {
      if (!Array.isArray(value)) throw new TypeError('Expected an array');
      return value.map((entry) => item.run(entry));
    }),
  record: <T>(item: Field<T>) =>
    new Field<Record<string, T>>((value) => {
      if (!isPlainObject(value)) throw new TypeError('Expected an object');
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, item.run(entry)]));
    }),
  object: (shape: Record<string, Field>) =>
    new Field<Record<string, unknown>>((value) => {
      if (!isPlainObject(value)) throw new TypeError('Expected an object');
      const out: Record<string, unknown> = { ...value };
      for (const [key, field] of Object.entries(shape)) {
        const next = field.run(value[key]);
        if (next === undefined) delete out[key];
        else out[key] = next;
      }
      return out;
    }),
};

export const arrayField = <T>(item: Field<T>) => n.array(item).catch([] as T[]);

export const withArrayDefaults = (shape: Record<string, Field>) => n.object(shape);

export const normalizeWith = <T>(schema: Field, raw: unknown): T => schema.run(raw) as T;
