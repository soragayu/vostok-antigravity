import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vostok | マーダーミステリー",
  description: "超高速調査船『ルナ号』で起きた悲劇。4人の宇宙飛行士による、木星軌道上の密室ミステリー。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        {children}
      </body>
    </html>
  );
}
