import type { Metadata } from "next";
import { LongFormHome } from "../page";

export const metadata: Metadata = {
  title: "avocadomini — 10の道具と仕組み",
  description: "avocadominiの10個の販売ツール、動作、検証、無料診断を詳しく紹介します。",
};

export default function DetailsPage() {
  return <LongFormHome />;
}
