import { useState, useEffect } from "react";
import { useAuth } from "@/utils/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import Navbar from "@/components/Navbar";
import { supabase } from "@/lib/supabase";

// Define a new type for the local storage ride requests
interface LocalRideRequest {
  id: string;
  studentName: string;
  studentEmail: string;
  pickupLocation: string;
  destination: string;
  date: string;
  time: string;
  status: "pending" | "accepted" | "completed" | "declined";
  disabilityType: string;
  additionalNotes?: string;
}

const Driver = () => {
  const { user } = useAuth();
  const [rideRequests, setRideRequests] = useState<LocalRideRequest[]>([]);

  // Helper function to safely convert status string to the allowed literal types
  const validateStatus = (status: string): "pending" | "accepted" | "completed" | "declined" => {
    if (status === "accepted") return "accepted";
    if (status === "completed") return "completed";
    if (status === "declined") return "declined";
    return "pending"; // Default fallback
  };

  // Helper function to process ride requests from localStorage
  const processRideRequests = (storedRequests: any[]): LocalRideRequest[] => {
    return storedRequests.map(request => ({
      id: request.id,
      studentName: request.studentName || "Unknown",
      studentEmail: request.studentEmail || "unknown@email.com",
      pickupLocation: request.pickupLocation || "",
      destination: request.destination || "",
      date: request.date || new Date().toLocaleDateString(),
      time: request.time || new Date().toLocaleTimeString(),
      status: validateStatus(request.status || "pending"),
      disabilityType: request.disabilityType || "Not specified",
      additionalNotes: request.additionalNotes
    }));
  };

  // Load ride requests and also save them to Supabase
  const loadRideRequests = async () => {
    // First try to load from Supabase
    try {
      const { data: dbRequests, error } = await supabase
        .from('ride_requests')
        .select('*');
      
      if (!error && dbRequests && dbRequests.length > 0) {
        console.log("Loaded ride requests from Supabase:", dbRequests);
        
        // Convert DB requests to LocalRideRequest format
        const formattedRequests: LocalRideRequest[] = dbRequests.map(dbReq => ({
          id: dbReq.id,
          studentName: dbReq.student_id, // We'll need to improve this with actual student names
          studentEmail: dbReq.student_id + "@example.com", // Placeholder
          pickupLocation: dbReq.pickup_location,
          destination: dbReq.destination,
          date: new Date(dbReq.created_at || Date.now()).toLocaleDateString(),
          time: new Date(dbReq.created_at || Date.now()).toLocaleTimeString(),
          status: validateStatus(dbReq.status),
          disabilityType: "Not specified", // This info isn't available in our current schema
          additionalNotes: "From database"
        }));
        
        setRideRequests(formattedRequests);
        return;
      }
    } catch (dbError) {
      console.error("Error loading ride requests from database:", dbError);
    }
    
    // Fall back to localStorage if no data in database
    const storedRequests = JSON.parse(localStorage.getItem("rideRequests") || "[]");
    const typedRequests = processRideRequests(storedRequests);
    setRideRequests(typedRequests);
    
    // Also ensure these are saved to Supabase
    if (typedRequests.length > 0) {
      try {
        for (const request of typedRequests) {
          // Check if this request already exists in the database
          const { data: existingData } = await supabase
            .from('ride_requests')
            .select('id')
            .eq('id', request.id)
            .maybeSingle();
            
          if (!existingData) {
            // Convert to the structure expected by the database
            const dbRequest = {
              id: request.id,
              student_id: request.studentEmail.split('@')[0], // Using email prefix as a simple student_id
              driver_id: null,
              pickup_location: request.pickupLocation,
              destination: request.destination,
              status: request.status === "declined" ? "rejected" : request.status, // Map declined to rejected for DB
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            
            await supabase.from('ride_requests').insert([dbRequest]);
          }
        }
      } catch (error) {
        console.error("Error syncing ride requests to database:", error);
      }
    }
  };

  useEffect(() => {
    // Load ride requests
    loadRideRequests();
  }, []);

  const handleRideAction = async (requestId: string, action: "accept" | "decline" | "complete") => {
    const updatedRequests = rideRequests.map(request => {
      if (request.id === requestId) {
        const newStatus: "pending" | "accepted" | "completed" | "declined" = 
          action === "accept" ? "accepted" : 
          action === "decline" ? "declined" : "completed";
        
        return {
          ...request,
          status: newStatus
        };
      }
      return request;
    });

    localStorage.setItem("rideRequests", JSON.stringify(updatedRequests));
    setRideRequests(updatedRequests);

    // Also update in Supabase
    try {
      const statusForDb = action === "decline" ? "rejected" : action === "accept" ? "accepted" : "completed";
      
      await supabase
        .from('ride_requests')
        .update({ 
          status: statusForDb,
          driver_id: user?.id || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', requestId);
    } catch (error) {
      console.error("Error updating ride request in database:", error);
    }

    toast({
      title: "Ride Request Updated",
      description: `Ride request has been ${action}ed.`,
    });
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <Navbar title="Driver Dashboard" />
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Driver Info Card */}
          <Card>
            <CardHeader>
              <CardTitle>Driver Information</CardTitle>
              <CardDescription>Your driver profile</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p><span className="font-medium">Name:</span> {user ? `${user.first_name} ${user.last_name}` : "Loading..."}</p>
                <p><span className="font-medium">Email:</span> {user?.email}</p>
                <p><span className="font-medium">Role:</span> Driver</p>
              </div>
            </CardContent>
          </Card>

          {/* Stats Card */}
          <Card>
            <CardHeader>
              <CardTitle>Ride Statistics</CardTitle>
              <CardDescription>Your ride performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-2xl font-bold">
                    {rideRequests.filter(r => r.status === "completed").length}
                  </p>
                  <p className="text-sm text-gray-500">Completed Rides</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {rideRequests.filter(r => r.status === "pending").length}
                  </p>
                  <p className="text-sm text-gray-500">Pending Requests</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions Card */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common tasks</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Button variant="outline" className="w-full" onClick={loadRideRequests}>
                  Refresh Requests
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Ride Requests Table */}
        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle>Ride Requests</CardTitle>
              <CardDescription>Manage student ride requests</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Pickup</TableHead>
                      <TableHead>Destination</TableHead>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Disability</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rideRequests.length > 0 ? (
                      rideRequests.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{request.studentName}</p>
                              <p className="text-sm text-gray-500">{request.studentEmail}</p>
                            </div>
                          </TableCell>
                          <TableCell>{request.pickupLocation}</TableCell>
                          <TableCell>{request.destination}</TableCell>
                          <TableCell>
                            <div>
                              <p>{request.date}</p>
                              <p className="text-sm text-gray-500">{request.time}</p>
                            </div>
                          </TableCell>
                          <TableCell>{request.disabilityType}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                request.status === "accepted" ? "default" :
                                request.status === "pending" ? "secondary" :
                                request.status === "completed" ? "outline" :
                                "destructive"
                              }
                            >
                              {request.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            {request.status === "pending" && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => handleRideAction(request.id, "accept")}
                                >
                                  Accept
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleRideAction(request.id, "decline")}
                                >
                                  Decline
                                </Button>
                              </>
                            )}
                            {request.status === "accepted" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRideAction(request.id, "complete")}
                              >
                                Complete
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No ride requests found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Driver;
