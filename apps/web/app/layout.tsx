import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MeoTDC — Cổng học tập số TDC",
  description: "Tạo đề theo chuẩn đầu ra, quản lý lớp học và theo dõi tiến độ đào tạo cho cộng đồng TDC.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
