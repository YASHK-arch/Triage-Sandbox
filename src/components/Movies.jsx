import React, { useEffect, useState } from "react";
import Banner from "./Banner";
import MovieCard from "./MovieCard";
import axios from "axios";
import Pagination from "./Pagination";

//  https://api.themoviedb.org/3/movie/popular?api_key=3aec63790d50f3b9fc2efb4c15a8cf99&language=en-US&page=3

function Movies({ watchlist, handleAddtoWatchlist, handleRemoveFromWatchlist }) {
  // get the data from the url
  // in the app and show the data on the console

const [movies , setMovies] =   useState([])
const [pageNo, setPageNo] = useState(1);

function incrementPage() {
  setPageNo(pageNo + 1);
}

function decrementPage() {
  if (pageNo >= 2) {
    setPageNo(pageNo - 1);
  }
}

  useEffect(() => {
    async function getMovies() {
      let response = await axios.get(
        `https://api.themoviedb.org/3/movie/popular?api_key=3aec63790d50f3b9fc2efb4c15a8cf99&language=en-US&page=${pageNo}`
      );
      setMovies(response.data.results)
    }

    getMovies()
  }, [pageNo]);

  return (
    <div>
      <Banner />

      <div className="mx-auto max-w-7xl px-4 py-8">
        <h2 className="text-3xl font-bold mb-6 border-l-4 border-yellow-500 pl-4">Popular Movies</h2>
        <div className="flex gap-6 flex-wrap justify-center sm:justify-start">
        {movies.map((movieObj)=>{
          return <MovieCard key={movieObj.id} movieObj={movieObj} title={movieObj.title} posterUrl={movieObj.poster_path} watchlist={watchlist} handleAddtoWatchlist={handleAddtoWatchlist} handleRemoveFromWatchlist={handleRemoveFromWatchlist} />
        })}
        </div>
      </div>

      <Pagination decrementPage={decrementPage} incrementPage={incrementPage} pageNo={pageNo}/>
    </div>
  );
}

export default Movies;