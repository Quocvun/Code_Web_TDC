export type StudyLevel = "Cao đẳng" | "Trung cấp";

export type Major = {
  id: string;
  name: string;
  level: StudyLevel;
  group: string;
  recruitment2026?: boolean;
};

export type MajorResource = { id: string; title: string; url: string; year: string; description: string };
export type MajorWithResources = Major & { resources: MajorResource[] };
const tdcCatalogResources: MajorResource[] = [
  { id: "tdc-fees-2025-26", title: "Thông báo học phí HKI 2025–2026", url: "https://online.tdc.edu.vn/img/Th%C3%B4ng%20b%C3%A1o%20chung/file/P_KHTC/HOC%20PHI%202025-2026/HOC%20KY%2001/THONG%20BAO%20THU%20HP%20HKI%202025-2026%20-%20Dieu%20chinh%207-9%20.pdf", year: "2025–2026", description: "Nguồn đối chiếu tên ngành và trình độ; không phải đề cương môn học." },
  { id: "tdc-handbook-2024", title: "Sổ tay học vụ theo khoa", url: "https://online.tdc.edu.vn/img/S%E1%BB%95%20tay%20Sinh%20vi%C3%AAn/file/So%20Tay%20HSSV/HK1%20NH%202024-2025/SO%20TAY%20HOC%20VU%20KHOA%202024.pdf", year: "2024–2025", description: "Tham khảo đơn vị/khoa đào tạo và thông tin học vụ; cần xác nhận lại phiên bản hiện hành với trường." },
];
const fit2026Resource: MajorResource = { id: "fit-training-2026", title: "Chương trình đào tạo FIT-TDC", url: "https://fit.tdc.edu.vn/dao-tao", year: "2026", description: "Thông tin chương trình theo khóa thuộc Khoa Công nghệ thông tin; xem trực tiếp tại nguồn chính thức." };
const fit2026AdmissionResource: MajorResource = { id: "fit-admission-2026", title: "Tuyển sinh FIT-TDC 2026", url: "https://fit.tdc.edu.vn/tuyen-sinh", year: "2026", description: "Thông tin tuyển sinh FIT; ngành/chương trình có thể thay đổi theo đợt tuyển sinh." };
export function getMajorCatalog(): MajorWithResources[] {
 const fitMajorIds = new Set(["design", "computer-communications", "it", "it-japan"]);
 return majors.map(major => ({ ...major, resources: [...tdcCatalogResources.map(resource => ({...resource})), ...(fitMajorIds.has(major.id) ? [{...fit2026Resource},{...fit2026AdmissionResource}] : [])] }));
}

// Catalog combines TDC's 2025–2026 published fee notice with the three
// programs explicitly named on the FIT-TDC 2026 admissions page.
export const majors: Major[] = [
  { id: "design", name: "Thiết kế đồ họa", level: "Cao đẳng", group: "Khoa học xã hội, nhân văn và kinh doanh", recruitment2026: true },
  { id: "japanese", name: "Tiếng Nhật", level: "Cao đẳng", group: "Khoa học xã hội, nhân văn và kinh doanh" },
  { id: "english", name: "Tiếng Anh", level: "Cao đẳng", group: "Khoa học xã hội, nhân văn và kinh doanh" },
  { id: "korean", name: "Tiếng Hàn Quốc", level: "Cao đẳng", group: "Khoa học xã hội, nhân văn và kinh doanh" },
  { id: "chinese", name: "Tiếng Trung Quốc", level: "Cao đẳng", group: "Khoa học xã hội, nhân văn và kinh doanh" },
  { id: "finance", name: "Tài chính - Ngân hàng", level: "Cao đẳng", group: "Khoa học xã hội, nhân văn và kinh doanh" },
  { id: "accounting", name: "Kế toán", level: "Cao đẳng", group: "Khoa học xã hội, nhân văn và kinh doanh" },
  { id: "accounting-it", name: "Kế toán tin học", level: "Cao đẳng", group: "Khoa học xã hội, nhân văn và kinh doanh" },
  { id: "business-admin", name: "Quản trị kinh doanh", level: "Cao đẳng", group: "Khoa học xã hội, nhân văn và kinh doanh" },
  { id: "commerce", name: "Kinh doanh thương mại", level: "Cao đẳng", group: "Khoa học xã hội, nhân văn và kinh doanh" },
  { id: "marketing", name: "Marketing", level: "Cao đẳng", group: "Khoa học xã hội, nhân văn và kinh doanh" },
  { id: "supermarket", name: "Quản lý siêu thị", level: "Cao đẳng", group: "Khoa học xã hội, nhân văn và kinh doanh" },
  { id: "logistics", name: "Logistics", level: "Cao đẳng", group: "Khoa học xã hội, nhân văn và kinh doanh" },
  { id: "tourism", name: "Quản trị dịch vụ du lịch và lữ hành", level: "Cao đẳng", group: "Dịch vụ và du lịch" },
  { id: "restaurant", name: "Quản trị nhà hàng", level: "Cao đẳng", group: "Dịch vụ và du lịch" },
  { id: "hotel", name: "Quản trị khách sạn", level: "Cao đẳng", group: "Dịch vụ và du lịch" },
  { id: "machine-building", name: "Chế tạo thiết bị cơ khí", level: "Cao đẳng", group: "Kỹ thuật và công nghệ thông tin" },
  { id: "mechanical-engineering", name: "Công nghệ kỹ thuật cơ khí", level: "Cao đẳng", group: "Kỹ thuật và công nghệ thông tin" },
  { id: "hvac", name: "Kỹ thuật máy lạnh và điều hòa không khí", level: "Cao đẳng", group: "Kỹ thuật và công nghệ thông tin" },
  { id: "automotive", name: "Công nghệ kỹ thuật ô tô", level: "Cao đẳng", group: "Kỹ thuật và công nghệ thông tin" },
  { id: "electrical-engineering", name: "Công nghệ kỹ thuật điện, điện tử", level: "Cao đẳng", group: "Kỹ thuật và công nghệ thông tin" },
  { id: "industrial-electricity", name: "Điện công nghiệp", level: "Cao đẳng", group: "Kỹ thuật và công nghệ thông tin" },
  { id: "computer-communications", name: "Truyền thông và mạng máy tính", level: "Cao đẳng", group: "Kỹ thuật và công nghệ thông tin", recruitment2026: true },
  { id: "it", name: "Công nghệ thông tin", level: "Cao đẳng", group: "Kỹ thuật và công nghệ thông tin", recruitment2026: true },
  { id: "it-japan", name: "Công nghệ thông tin (hợp tác với Nhật Bản)", level: "Cao đẳng", group: "Kỹ thuật và công nghệ thông tin" },
  { id: "industrial-electrical-installation", name: "Kỹ thuật lắp đặt điện và điều khiển trong công nghiệp", level: "Cao đẳng", group: "Kỹ thuật và công nghệ thông tin" },
  { id: "automation-engineering", name: "Công nghệ kỹ thuật điều khiển và tự động hóa", level: "Cao đẳng", group: "Kỹ thuật và công nghệ thông tin" },
  { id: "mechatronics", name: "Công nghệ kỹ thuật cơ điện tử", level: "Cao đẳng", group: "Kỹ thuật và công nghệ thông tin" },
  { id: "industrial-electronics", name: "Điện tử công nghiệp", level: "Cao đẳng", group: "Kỹ thuật và công nghệ thông tin" },
  { id: "telecommunications-engineering", name: "Công nghệ kỹ thuật điện tử, truyền thông", level: "Cao đẳng", group: "Kỹ thuật và công nghệ thông tin" },
  { id: "industrial-automation", name: "Tự động hóa công nghiệp", level: "Cao đẳng", group: "Kỹ thuật và công nghệ thông tin" },
  { id: "business-accounting", name: "Kế toán doanh nghiệp", level: "Trung cấp", group: "Khoa học xã hội, nhân văn và kinh doanh" },
  { id: "supermarket-management", name: "Quản lý và bán hàng siêu thị", level: "Trung cấp", group: "Khoa học xã hội, nhân văn và kinh doanh" },
  { id: "food-service", name: "Quản lý và kinh doanh nhà hàng và dịch vụ ăn uống", level: "Trung cấp", group: "Dịch vụ và du lịch" },
  { id: "mechanical-technician", name: "Công nghệ kỹ thuật cơ khí", level: "Trung cấp", group: "Kỹ thuật và công nghệ thông tin" },
  { id: "auto-maintenance", name: "Bảo trì và sửa chữa ô tô", level: "Trung cấp", group: "Kỹ thuật và công nghệ thông tin" },
  { id: "residential-industrial-electricity", name: "Điện công nghiệp và dân dụng", level: "Trung cấp", group: "Kỹ thuật và công nghệ thông tin" },
];

export type UserRole = "student" | "teacher" | "school" | "admin";

export type MeoUser = {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  email?: string;
  authProvider?: "google";
  major?: string;
  majorGroup?: string;
  studentCode?: string;
  className?: string;
};

export const demoPassword = "MeoTDC@2026";

export const demoAccounts: MeoUser[] = [
  { id: "demo-student-01", username: "sv.demo", fullName: "Nguyễn Minh Anh", role: "student", major: "Công nghệ thông tin", majorGroup: "Kỹ thuật và công nghệ thông tin", studentCode: "SV-DEMO-2026", className: "CĐ23_TH1" },
  { id: "demo-teacher-01", username: "gv.demo", fullName: "Trần Minh Giang", role: "teacher" },
  { id: "demo-school-01", username: "school.demo", fullName: "Phòng Đào tạo TDC", role: "school" },
];
