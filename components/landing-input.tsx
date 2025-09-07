"use client";

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function InputDemo() {
  return (
    <div className="text-left space-y-2">
        <Label htmlFor="code">Code</Label>
        <Input id="code" type="email" placeholder="Email" />
    </div>
    
  )
  }
