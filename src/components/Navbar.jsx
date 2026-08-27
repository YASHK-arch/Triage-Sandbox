import React, { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import StreamBoxLogo from './StreamBoxLogo'

const navLinks = [
  { to: '/', label: 'Movies' },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/mood', label: 'Mood Selector' },
]

function Navbar() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    handleScroll()
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <nav
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-neutral-950/95 backdrop-blur-md shadow-lg shadow-black/40 border-b border-neutral-800'
          : 'bg-gradient-to-b from-black/80 to-transparent'
      }`}
    >
      <div className="flex items-center justify-between px-5 md:px-10 py-3.5">
        {/* Logo */}
        <NavLink to="/" className="flex items-center group">
          <StreamBoxLogo className="h-8 w-auto transition-transform duration-300 group-hover:scale-105" />
        </NavLink>

        {/* Navigation Options */}
        <div className="flex items-center gap-1 md:gap-2 text-sm font-medium">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) =>
                `px-3 md:px-4 py-1.5 rounded-md transition-all duration-200 ${
                  link.to === '/mood'
                    ? 'bg-white text-black font-bold hover:bg-white/85 hover:scale-105 active:scale-95'
                    : isActive
                    ? 'text-white hover:text-white'
                    : 'text-gray-300 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <span className="relative">
                  {link.label}
                  {link.to !== '/mood' && (
                    <span
                      className={`absolute -bottom-1 left-0 h-0.5 bg-red-600 transition-all duration-300 ${
                        isActive ? 'w-full' : 'w-0'
                      }`}
                    />
                  )}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  )
}

export default Navbar