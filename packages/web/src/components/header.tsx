"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield, Send, LayoutDashboard, Settings, ScrollText } from "lucide-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

const navigation = [
  { name: "Send", href: "/", icon: Send },
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Audit", href: "/audit", icon: ScrollText },
  { name: "Admin", href: "/admin", icon: Settings },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary-600 text-white transition-transform duration-200 group-hover:scale-105">
              <Shield className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold text-gray-900 leading-tight">
                PayClear
              </span>
              <span className="text-[10px] font-medium text-primary-600 uppercase tracking-wider leading-none">
                Protocol
              </span>
            </div>
          </Link>

          {/* Navigation */}
          <nav className="hidden sm:flex items-center gap-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-primary-50 text-primary-700"
                      : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Wallet */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-medium text-emerald-700">
                Devnet
              </span>
            </div>
            <WalletMultiButton />
          </div>
        </div>
      </div>
    </header>
  );
}
