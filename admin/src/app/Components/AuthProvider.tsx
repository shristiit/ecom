// // app/Components/AuthProvider.tsx
// "use client";

// import { createContext, useContext, useEffect, useState } from "react";
// import { useRouter } from "next/navigation";

// type AuthContextType = {
//   isAuthenticated: boolean;
//   loading: boolean;
// };

// const AuthContext = createContext<AuthContextType>({ isAuthenticated: false, loading: true });
// // 
// export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
//   const [isAuthenticated, setIsAuthenticated] = useState(false);
//   const [loading, setLoading] = useState(true);
  

//   useEffect(() => {
//     const token = localStorage.getItem("accessToken");
//     if (token) {
//       setIsAuthenticated(true);
//     }
//     setLoading(false);
//   }, []);

//   return (
//     <AuthContext.Provider value={{ isAuthenticated, loading }}>
//       {children}
//     </AuthContext.Provider>
//   );
// };

// export const useAuth = () => useContext(AuthContext);
