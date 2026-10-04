import { Wheel } from "./wheel";

export default async function OverlayPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <Wheel overlayKey={key} />;
}
