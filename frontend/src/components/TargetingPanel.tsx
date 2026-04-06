import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FormattedTargeting } from "@/api/client";

interface TargetingPanelProps {
  targeting: FormattedTargeting;
}

export default function TargetingPanel({ targeting }: TargetingPanelProps) {
  const [showRawJson, setShowRawJson] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Configuración de Targeting</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRawJson(!showRawJson)}
          >
            {showRawJson ? "Ver Estructura" : "Ver JSON"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {showRawJson ? (
          <div className="bg-gray-100 p-4 rounded overflow-auto max-h-96">
            <pre className="text-xs">{JSON.stringify(targeting.raw_json, null, 2)}</pre>
          </div>
        ) : (
          <>
            {/* Edad */}
            <div>
              <h3 className="font-semibold text-sm mb-2">Rango de edad</h3>
              <p className="text-gray-700">{targeting.age_range}</p>
            </div>

            <Separator />

            {/* Género */}
            <div>
              <h3 className="font-semibold text-sm mb-2">Género</h3>
              {targeting.genders.length > 0 ? (
                <div className="flex gap-2">
                  {targeting.genders.map((gender, i) => (
                    <span key={i} className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">
                      {gender}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No especificado</p>
              )}
            </div>

            <Separator />

            {/* Ubicaciones */}
            <div>
              <h3 className="font-semibold text-sm mb-2">Ubicaciones</h3>
              {targeting.locations.countries?.length ? (
                <div className="space-y-2">
                  <p className="text-sm text-gray-700">
                    Países: {targeting.locations.countries.join(", ")}
                  </p>
                </div>
              ) : null}
              {targeting.locations.regions?.length ? (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium">Regiones:</h4>
                  {targeting.locations.regions.map((region, i) => (
                    <p key={i} className="text-sm text-gray-700">
                      • {region.name} {region.radius_km ? `(${region.radius_km} km)` : ""}
                    </p>
                  ))}
                </div>
              ) : null}
              {!targeting.locations.countries?.length && !targeting.locations.regions?.length ? (
                <p className="text-gray-500">No especificado</p>
              ) : null}
            </div>

            <Separator />

            {/* Audiencias */}
            <div>
              <h3 className="font-semibold text-sm mb-2">Audiencias</h3>
              {Object.keys(targeting.audiences).length > 0 ? (
                <div className="space-y-4">
                  {Object.entries(targeting.audiences).map(([category, items]) => (
                    <div key={category}>
                      <h4 className="text-xs font-medium capitalize mb-2">
                        {category.replace(/_/g, " ")}
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {items.map((item, i) => (
                          <span key={i} className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
                            {item.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No especificado</p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
