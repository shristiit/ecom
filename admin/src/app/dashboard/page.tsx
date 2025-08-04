import React from 'react'
import AppBarChart from './Components/AppBarChart'
import AppAreaChart from './Components/AppAreaChart'
import AppUsers from './Components/AppUsers'
const page = () => {
  return (
    <div className='grid grid-1 lg:grid-cols-2 2xl:grid-col-3 gap-[5rem]'>
      <div className='border lg:col-span-2'><AppUsers/></div>
      <div className=' rounded-lg'><AppAreaChart /></div>
      
      <div className=''><AppBarChart/></div>
      <div className='bg-yellow-300 rounded-lg lg:col-span-2 2xl:col-span-2'>hola</div>
      
      <div className=''></div>
      <div className='bg-pink-300'>ciao</div>  
    </div>
  )
}

export default page

