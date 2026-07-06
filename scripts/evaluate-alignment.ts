import { alignCanonicalLyrics } from "../src/domain/alignment/engine";
import { alignmentFixtures, canonicalFixture } from "../src/test/fixtures/alignment/fixtures";

const report = alignmentFixtures.map((fixture) => {
  const result = alignCanonicalLyrics(canonicalFixture(fixture.id), fixture.transcript);
  const accepted = result.lines.filter((line) => line.reviewState === "accepted").length;
  const ambiguous = result.lines.filter((line) => line.reviewState === "ambiguous").length;
  const unresolved = result.lines.filter((line) => line.reviewState === "unresolved").length;
  return {
    id: fixture.id,
    title: fixture.title,
    accepted,
    ambiguous,
    unresolved,
    issues: result.issues.map((issue) => issue.code),
    cells: result.benchmark.cells,
    elapsedMs: Number(result.benchmark.elapsedMs.toFixed(2)),
    hierarchicalAlignmentTriggered: result.benchmark.hierarchicalAlignmentTriggered,
  };
});

console.table(report);
