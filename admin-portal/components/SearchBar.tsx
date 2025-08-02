import { View, Text, TextInput } from 'react-native'
import React, { useState } from 'react'

const SearchBar = () => {
    const data = ["Sales", "Stores", "Pending Orders","Sarees"];
    const[searchItem,setSearchItem] = useState("");

    const filteredItem = data.filter(item => item.toLowerCase().includes(searchItem.toLowerCase()))
  return (
    <View>
      <TextInput 
      value={searchItem}
       onChange={(e) => setSearchItem(e.target.value)}
        style={{ padding: 10, width: '80%' }}/>
         <ul>
        {filteredItem.length > 0 ? (
          filteredItem.map((item, index) => <li key={index}>{item}</li>)
        ) : (
          <li>No results found</li>
        )}
      </ul>
    </View>
  )
}

export default SearchBar