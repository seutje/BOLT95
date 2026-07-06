import { useMemo, useState } from "react";
import { alignCanonicalLyrics, lineReviewLabel } from "../../domain/alignment/engine";
import { alignmentFixtures, canonicalFixture } from "../../test/fixtures/alignment/fixtures";

function formatTime(milliseconds: number | undefined): string {
  if (milliseconds === undefined) return "--:--.---";
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  const ms = milliseconds % 1000;
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
}

export function AlignmentFixtureViewer() {
  const [fixtureId, setFixtureId] = useState(alignmentFixtures[0]?.id ?? "exact");
  const fixture =
    alignmentFixtures.find((candidate) => candidate.id === fixtureId) ?? alignmentFixtures[0]!;
  const result = useMemo(
    () => alignCanonicalLyrics(canonicalFixture(fixture.id), fixture.transcript),
    [fixture],
  );

  return (
    <section className="group-box alignment-fixture" aria-labelledby="alignment-fixture-title">
      <h2 id="alignment-fixture-title">3. Alignment fixture viewer</h2>
      <div className="fixture-toolbar">
        <label htmlFor="alignment-fixture-select">Fixture</label>
        <select
          id="alignment-fixture-select"
          value={fixture.id}
          onChange={(event) => setFixtureId(event.target.value)}
        >
          {alignmentFixtures.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.title}
            </option>
          ))}
        </select>
        <span role="status">
          {result.benchmark.canonicalWords} words · {result.benchmark.cells} DP cells
        </span>
      </div>

      {result.issues.length > 0 && (
        <ul className="alignment-issues" aria-label="Alignment issues">
          {result.issues.map((issue) => (
            <li key={`${issue.code}-${issue.lineIds.join("-")}`}>{issue.message}</li>
          ))}
        </ul>
      )}

      <div className="alignment-table-wrap">
        <table className="alignment-table">
          <thead>
            <tr>
              <th scope="col">Line</th>
              <th scope="col">Start</th>
              <th scope="col">End</th>
              <th scope="col">Source</th>
              <th scope="col">Confidence</th>
              <th scope="col">Review</th>
            </tr>
          </thead>
          <tbody>
            {result.lines
              .filter((line) => !line.displayText.startsWith("[") && line.displayText.length > 0)
              .map((line) => (
                <tr
                  key={line.lineId}
                  className={line.ambiguous ? "alignment-ambiguous" : undefined}
                >
                  <td>{line.displayText}</td>
                  <td>{formatTime(line.startMs)}</td>
                  <td>{formatTime(line.endMs)}</td>
                  <td>{line.provenance}</td>
                  <td>{Math.round(line.confidence * 100)}%</td>
                  <td>{lineReviewLabel(line.reviewState)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
