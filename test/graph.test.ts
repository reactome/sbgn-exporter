// The bulk list from the graph (spec 001 T022, research R10): the settings from the
// environment, diagram-exporter's query, the rows read into pathways, and the session a
// read-only one on the settings' database, with a stub in place of neo4j-driver's driver.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BULK_QUERY,
  bulkList,
  GraphAnswerError,
  graphSettings,
  GraphSettingsError,
  LIST_QUERY,
  pathwayIdentifier,
  pathwayList,
  openGraph,
  type BoltDriver,
  type GraphReader,
} from '../src/graph.ts';

test('the settings come from NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD and NEO4J_DATABASE', () => {
  assert.deepEqual(graphSettings({ NEO4J_URI: 'bolt://localhost:7687' }), {
    uri: 'bolt://localhost:7687',
    user: 'neo4j',
    password: '',
    database: 'graph.db',
  });
  assert.deepEqual(
    graphSettings({
      NEO4J_URI: 'neo4j://graph:7687',
      NEO4J_USER: 'reader',
      NEO4J_PASSWORD: 'secret',
      NEO4J_DATABASE: 'other',
    }),
    { uri: 'neo4j://graph:7687', user: 'reader', password: 'secret', database: 'other' }
  );
  assert.throws(() => graphSettings({}), GraphSettingsError);
  assert.throws(() => graphSettings({ NEO4J_URI: '' }), GraphSettingsError);
});

test("the query is diagram-exporter's for one species, returning stable id and dbId", () => {
  // diagram-exporter 2.0.12, Main.java, for --target <species name>:
  //   MATCH (p:Pathway{hasDiagram:True, speciesName:$speciesName}) WITH DISTINCT p
  //   RETURN p ORDER BY p.dbId
  assert.equal(
    BULK_QUERY,
    'MATCH (p:Pathway{hasDiagram:True, speciesName:$speciesName}) WITH DISTINCT p ' +
      'RETURN p.stId AS stId, p.dbId AS dbId ORDER BY p.dbId'
  );
});

function reader(rows: readonly unknown[], calls: unknown[] = []): GraphReader {
  return {
    read: (query, parameters) => {
      calls.push([query, parameters]);
      return Promise.resolve(rows);
    },
    close: () => Promise.resolve(),
  };
}

test('the list is the rows, in the order the graph gives them', async () => {
  const calls: unknown[] = [];
  const rows = [
    { stId: 'R-HSA-109581', dbId: 109581 },
    { stId: 'R-HSA-1059683', dbId: 1059683 },
  ];
  assert.deepEqual(await bulkList(reader(rows, calls), 'Homo sapiens'), rows);
  assert.deepEqual(calls, [[BULK_QUERY, { speciesName: 'Homo sapiens' }]]);
  assert.deepEqual(await bulkList(reader([]), 'Homo sapiens'), []);
});

test('a row that is not a stable id and a dbId, or a pathway listed twice, is refused', async () => {
  for (const row of [
    { stId: 'R-HSA-1' },
    { dbId: 1 },
    { stId: 'R-HSA-1', dbId: 1.5 },
    { stId: 'R-HSA-1', dbId: '1' },
    { stId: 'Homo sapiens', dbId: 1 },
    { stId: null, dbId: 1 },
    null,
    ['R-HSA-1', 1],
  ]) {
    await assert.rejects(
      bulkList(reader([row]), 'Homo sapiens'),
      GraphAnswerError,
      JSON.stringify(row)
    );
  }
  await assert.rejects(
    bulkList(
      reader([
        { stId: 'R-HSA-1', dbId: 1 },
        { stId: 'R-HSA-1', dbId: 2 },
      ]),
      'Homo sapiens'
    ),
    /R-HSA-1 twice/
  );
});

test("each read is a read-only session on the settings' database, closed after", async () => {
  const log: unknown[] = [];
  const driver: BoltDriver = {
    session: (config) => {
      log.push(['session', config]);
      return {
        executeRead: (work) =>
          work({
            run: (query, parameters) => {
              log.push(['run', query, parameters]);
              return Promise.resolve({
                records: [{ toObject: () => ({ stId: 'R-HSA-1', dbId: 1 }) }],
              });
            },
          }),
        close: () => {
          log.push(['session closed']);
          return Promise.resolve();
        },
      };
    },
    close: () => {
      log.push(['driver closed']);
      return Promise.resolve();
    },
  };
  const settings = graphSettings({ NEO4J_URI: 'bolt://localhost:7687' });
  const graph = openGraph(settings, driver);
  assert.deepEqual(await bulkList(graph, 'Homo sapiens'), [{ stId: 'R-HSA-1', dbId: 1 }]);
  await graph.close();
  assert.deepEqual(log, [
    ['session', { database: 'graph.db', defaultAccessMode: 'READ' }],
    ['run', BULK_QUERY, { speciesName: 'Homo sapiens' }],
    ['session closed'],
    ['driver closed'],
  ]);
});

test('a session is closed when the query fails', async () => {
  let closed = false;
  const driver: BoltDriver = {
    session: () => ({
      executeRead: () => Promise.reject(new Error('unreachable')),
      close: () => {
        closed = true;
        return Promise.resolve();
      },
    }),
    close: () => Promise.resolve(),
  };
  const graph = openGraph(graphSettings({ NEO4J_URI: 'bolt://localhost:7687' }), driver);
  await assert.rejects(bulkList(graph, 'Homo sapiens'), /unreachable/);
  assert.ok(closed);
});

test("the list query is diagram-exporter's for several identifiers", async () => {
  // diagram-exporter 2.0.12, Main.java, for --target with more than one identifier:
  //   MATCH (p:Pathway{hasDiagram:True}) WHERE p.dbId IN $dbIds OR p.stId IN $stIds
  //   WITH DISTINCT p RETURN p ORDER BY p.dbId
  assert.equal(
    LIST_QUERY,
    'MATCH (p:Pathway{hasDiagram:True}) WHERE p.dbId IN $dbIds OR p.stId IN $stIds ' +
      'WITH DISTINCT p RETURN p.stId AS stId, p.dbId AS dbId ORDER BY p.dbId'
  );
  const calls: unknown[] = [];
  const rows = [{ stId: 'R-HSA-9', dbId: 9 }];
  const ids = ['R-HSA-9.2', '10'].flatMap((given) => pathwayIdentifier(given) ?? []);
  assert.deepEqual(ids, [
    { stId: 'R-HSA-9', given: 'R-HSA-9.2' },
    { dbId: 10, given: '10' },
  ]);
  const list = await pathwayList(reader(rows, calls), ids);
  assert.deepEqual(list, rows);
  const [[query, parameters]] = calls as [
    [string, { stIds: string[]; dbIds: { toNumber(): number }[] }],
  ];
  assert.equal(query, LIST_QUERY);
  assert.deepEqual(parameters.stIds, ['R-HSA-9']);
  // dbIds as Bolt integers, not floats
  assert.deepEqual(
    parameters.dbIds.map((n) => [n.constructor.name, n.toNumber()]),
    [['Integer', 10]]
  );
  for (const bad of ['', 'pathway', 'R-HSA-', 'R-HSA-9.x', '1.5', 'r-hsa-9']) {
    assert.equal(pathwayIdentifier(bad), undefined, bad);
  }
});
