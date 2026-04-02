// components/generators/math/geometry/FigureMeta.tsx

import type { FigureSpec } from "@/lib/math/geometry/types";

type MeasurementKey =
  | "length"
  | "width"
  | "side"
  | "base"
  | "height"
  | "topBase"
  | "leftSide"
  | "rightSide"
  | "radius";

export default function FigureMeta({
  figure,
  tMeasurement,
}: {
  figure?: FigureSpec;
  tMeasurement: (key: MeasurementKey) => string;
}) {
  if (!figure) return null;

  if (figure.kind === "rectangle" && figure.widthCm && figure.heightCm) {
    return (
      <p className="figure-meta-text">
        {tMeasurement("length")}: {figure.widthCm} cm, {tMeasurement("width")}:{" "}
        {figure.heightCm} cm
      </p>
    );
  }

  if (figure.kind === "square" && figure.sideCm) {
    return (
      <p className="figure-meta-text">
        {tMeasurement("side")}: {figure.sideCm} cm
      </p>
    );
  }

  if (
    figure.kind === "parallelogram" &&
    figure.baseCm &&
    figure.sideCm &&
    figure.heightCm
  ) {
    return (
      <p className="figure-meta-text">
        {tMeasurement("base")}: {figure.baseCm} cm, {tMeasurement("side")}:{" "}
        {figure.sideCm} cm, {tMeasurement("height")}: {figure.heightCm} cm
      </p>
    );
  }

  if (figure.kind === "rhombus" && figure.sideCm && figure.heightCm) {
    return (
      <p className="figure-meta-text">
        {tMeasurement("side")}: {figure.sideCm} cm, {tMeasurement("height")}:{" "}
        {figure.heightCm} cm
      </p>
    );
  }

  if (
    figure.kind === "trapezoid" &&
    figure.baseCm &&
    figure.topCm &&
    figure.heightCm &&
    figure.sideLeftCm &&
    figure.sideRightCm
  ) {
    return (
      <p className="figure-meta-text">
        {tMeasurement("base")}: {figure.baseCm} cm, {tMeasurement("topBase")}:{" "}
        {figure.topCm} cm, {tMeasurement("height")}: {figure.heightCm} cm,{" "}
        {tMeasurement("leftSide")}: {figure.sideLeftCm} cm,{" "}
        {tMeasurement("rightSide")}: {figure.sideRightCm} cm
      </p>
    );
  }

  if (
    figure.kind === "triangle_right" &&
    figure.baseCm &&
    figure.sideBcm &&
    figure.sideCcm
  ) {
    return (
      <p className="figure-meta-text">
        {tMeasurement("base")}: {figure.baseCm} cm, {tMeasurement("side")}:{" "}
        {figure.sideBcm} cm, {tMeasurement("side")}: {figure.sideCcm} cm
        {figure.heightCm ? (
          <>
            , {tMeasurement("height")}: {figure.heightCm} cm
          </>
        ) : null}
      </p>
    );
  }

  if (
    figure.kind === "triangle_isosceles" &&
    figure.baseCm &&
    figure.sideBcm &&
    figure.sideCcm
  ) {
    return (
      <p className="figure-meta-text">
        {tMeasurement("base")}: {figure.baseCm} cm, {tMeasurement("side")}:{" "}
        {figure.sideBcm} cm, {tMeasurement("side")}: {figure.sideCcm} cm
        {figure.heightCm ? (
          <>
            , {tMeasurement("height")}: {figure.heightCm} cm
          </>
        ) : null}
      </p>
    );
  }

  if (figure.kind === "triangle_equilateral" && (figure.sideCm || figure.sideAcm)) {
    const side = figure.sideCm ?? figure.sideAcm;
    return (
      <p className="figure-meta-text">
        {tMeasurement("side")}: {side} cm
        {figure.heightCm ? (
          <>
            , {tMeasurement("height")}: {figure.heightCm} cm
          </>
        ) : null}
      </p>
    );
  }

  if (figure.kind === "circle" && figure.radiusCm) {
    return (
      <p className="figure-meta-text">
        {tMeasurement("radius")}: {figure.radiusCm} cm
      </p>
    );
  }

  return null;
}