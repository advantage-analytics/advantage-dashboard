    import { Button } from "@/components/ui/button";
    import { Bell, Menu, Search } from "lucide-react";

    export default function Header() {
    return (
        <header className="absolute top-0 left-0 right-0 z-30 flex items-center gap-4 bg-transparent px-8 py-6">
        {/* Left: Menu Button */}
        <Button variant="ghost" size="icon" className="shrink-0 hover:bg-transparent">
            <Menu className="h-5 w-5 text-white hover:scale-110 transition-transform" />
        </Button>

        {/* Middle: Search Bar */}
        <div className="flex-1 max-w-md mx-auto">
            <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-[#999999]" />
            <input
                type="search"
                placeholder="Search..."
                className="w-full h-10 pl-10 pr-4 rounded-full backdrop-blur text-[14px] text-gray-[#999999]outline-none focus:outline-none focus:ring-0"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.4)',
                  mixBlendMode: 'luminosity'
                }}
            />
            </div>
        </div>

        {/* Right: Notifications & Profile */}
        <div className="flex items-center gap-3 shrink-0">
            <Button variant="ghost" size="icon" className="relative hover:bg-transparent">
            <Bell className="h-5 w-5 text-white hover:scale-110 transition-transform" />
            {/* <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full" /> */}
            </Button>

            <Button variant="ghost" size="icon" className="rounded-full">
            <div className="h-8 w-8 rounded-full bg-white hover:scale-105 transition-transform flex items-center justify-center text-black font-medium text-xs">
                CG
            </div>
            </Button>
        </div>
        </header>
    );
    }
