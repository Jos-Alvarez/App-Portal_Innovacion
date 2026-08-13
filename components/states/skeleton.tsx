import styles from "./states.module.css";

/**
 * Geometry of one placeholder block. Any CSS length is accepted so a view can
 * mirror the shape of its real content without this component knowing anything
 * about that content.
 */
export interface SkeletonBlock {
  width?: string;
  height?: string;
  radius?: string;
}

export interface SkeletonProps {
  /** Blocks to draw, in order. Defaults to one full-width row. */
  blocks?: readonly SkeletonBlock[];
  /** What is loading, for assistive tech. */
  label?: string;
}

const DEFAULT_BLOCKS: readonly SkeletonBlock[] = [{ width: "100%" }];

/**
 * Carga state — DESIGN.md: "skeleton shimmer (`lx-shimmer`) con la geometría
 * del contenido real; nunca pantalla en blanco".
 */
export function Skeleton({ blocks = DEFAULT_BLOCKS, label = "Cargando información" }: SkeletonProps) {
  return (
    <div className={styles.skeleton} role="status" aria-busy="true">
      {blocks.map((block, index) => (
        <div
          // Blocks are pure geometry with no identity of their own; order is
          // the only thing that distinguishes them.
          key={index}
          data-testid="skeleton-block"
          className={`${styles.block} lx-shimmer`}
          style={{
            width: block.width ?? "100%",
            height: block.height ?? "14px",
            borderRadius: block.radius ?? "6px",
          }}
        />
      ))}
      <span className="lx-sr-only">{label}</span>
    </div>
  );
}
