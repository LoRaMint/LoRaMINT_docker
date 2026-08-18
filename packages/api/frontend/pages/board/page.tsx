import Layout from "../../components/layout/Layout";
import PageHeading from "../../components/PageHeading";
import Tile from "../../components/board/Tile";
import type { BoardTile } from "../../../services/dashboard";

/** Auto-refresh interval for the board, in seconds. */
const REFRESH_SECONDS = 30;

/**
 * The public dashboard: curated measurements as gauge tiles, for a screen in a
 * hallway or classroom. Server-rendered, no client bundle - refreshes itself by
 * reloading, same as /status.
 */
export default function BoardPage(props: { tiles: BoardTile[] }) {
  return (
    <Layout>
      <PageHeading
        title="Dashboard"
        intro={
          <>
            Ausgewählte Messwerte auf einen Blick. Aktualisiert sich automatisch
            alle {REFRESH_SECONDS} Sekunden.
          </>
        }
      />

      {props.tiles.length === 0 ? (
        <p class="text-base-content/70">Noch keine Einträge.</p>
      ) : (
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {props.tiles.map((tile) => (
            <Tile tile={tile} />
          ))}
        </div>
      )}

      {/* Auto-refresh: reload the whole (server-rendered) page periodically. */}
      <script>{`setTimeout(function () { location.reload(); }, ${REFRESH_SECONDS * 1000});`}</script>
    </Layout>
  );
}
