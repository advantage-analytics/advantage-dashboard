import Link from "next/link";
import Image from "next/image";
import logo from "@/public/logo.svg";
import {
  Home,
  UsersRound,
  Calendar,
  ChartColumn,
  Download,
  UserRound,
  Settings,
  HelpCircle,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

// Main menu items
const mainItems = [
  { title: "Home", url: "/dashboard", icon: Home },
  { title: "Team", url: "/dashboard/team", icon: UsersRound },
  { title: "Schedule", url: "/dashboard/schedule", icon: Calendar },
  { title: "Statistics", url: "/dashboard/statistics", icon: ChartColumn },
  { title: "Upload", url: "/dashboard/upload", icon: Download },
  { title: "Profile", url: "/dashboard/profile", icon: UserRound },
];

// Bottom menu items
const bottomItems = [
  { title: "Settings", url: "/dashboard/settings", icon: Settings },
  { title: "Help", url: "/dashboard/help", icon: HelpCircle },
];

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarContent>
        {/* Top Menu */}
        <SidebarGroup>
            <Link href="/">
              <Image
                src={logo}
                alt="logo"
                width={180}
                height={32}
                className="mx-auto"
              />
            </Link>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Bottom Menu (pushes to bottom) */}
        <SidebarGroup className="mt-auto">
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {bottomItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
