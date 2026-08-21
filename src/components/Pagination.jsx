import React from "react";

function Pagination({ decrementPage, incrementPage, pageNo }) {
  return (
    <div className="flex justify-center items-center gap-6 py-8 mt-4">
      {/* Previous Button */}
      <button 
        onClick={decrementPage} 
        disabled={pageNo === 1}
        className={`flex items-center justify-center w-12 h-12 rounded-full transition-all duration-300 shadow-lg ${
          pageNo === 1 
            ? "bg-neutral-800 text-neutral-600 cursor-not-allowed" 
            : "bg-neutral-800 text-white hover:bg-yellow-500 hover:text-black hover:-translate-x-1 hover:shadow-[0_0_15px_rgba(234,179,8,0.5)] cursor-pointer"
        }`}
        aria-label="Previous Page"
      >
        <i className="fa-solid fa-chevron-left text-lg"></i>
      </button>

      {/* Page Indicator Bubble */}
      <div className="flex items-center justify-center min-w-[3rem] px-4 h-12 rounded-full bg-neutral-900 border border-neutral-700 shadow-inner">
        <span className="text-xl font-bold text-yellow-500">
          {pageNo}
        </span>
      </div>

      {/* Next Button */}
      <button 
        onClick={incrementPage} 
        className="flex items-center justify-center w-12 h-12 rounded-full bg-neutral-800 text-white transition-all duration-300 shadow-lg hover:bg-yellow-500 hover:text-black hover:translate-x-1 hover:shadow-[0_0_15px_rgba(234,179,8,0.5)] cursor-pointer"
        aria-label="Next Page"
      >
        <i className="fa-solid fa-chevron-right text-lg"></i>
      </button>
    </div>
  );
}

export default Pagination;